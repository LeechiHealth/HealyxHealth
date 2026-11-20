import Foundation
import Observation
import AVFoundation
import Speech
import HealyxKit

/// Talking to Healyx: live dictation with Apple's speech recognizer, and replies
/// spoken in a natural voice from the Healyx server (Gemini text-to-speech).
/// If the server voice is unavailable, the best installed system voice is used.
/// Playback runs through the same audio engine as the microphone with voice
/// processing on, so Healyx can hear you interrupt without hearing itself.
@MainActor
@Observable
final class VoiceService {
    private(set) var isListening = false
    private(set) var isSpeaking = false
    private(set) var transcript = ""
    var errorMessage: String?

    /// Gemini's warm, friendly voice.
    static let serverVoice = "Sulafat"

    @ObservationIgnored private let recognizer = SFSpeechRecognizer(locale: Locale.current) ?? SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    @ObservationIgnored private let engine = AVAudioEngine()
    @ObservationIgnored private let playerNode = AVAudioPlayerNode()
    @ObservationIgnored private var playerFormat: AVAudioFormat?
    @ObservationIgnored private var engineConfigured = false
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?
    @ObservationIgnored private var silenceTimer: Task<Void, Never>?
    @ObservationIgnored private let synthesizer = AVSpeechSynthesizer()
    @ObservationIgnored private var speechDelegate: SpeechDelegate?
    @ObservationIgnored private var onFinishedSpeaking: (() -> Void)?
    @ObservationIgnored private var onBargeIn: (() -> Void)?
    @ObservationIgnored private var speakTask: Task<Void, Never>?
    @ObservationIgnored private var playContinuation: CheckedContinuation<Void, Never>?
    @ObservationIgnored private var systemSpeechContinuation: CheckedContinuation<Void, Never>?
    @ObservationIgnored private let api: HealyxAPI

    init(api: HealyxAPI = HealyxBackend.shared.api) {
        self.api = api
        let delegate = SpeechDelegate()
        delegate.onFinish = { [weak self] in
            Task { @MainActor in self?.systemSpeechFinished() }
        }
        speechDelegate = delegate
        synthesizer.delegate = delegate
    }

    // MARK: Permissions

    /// Asks for speech recognition and microphone access. Returns false with a plain message if either is off.
    func requestAccess() async -> Bool {
        let speech = await Self.speechAuthorization()
        guard speech == .authorized else {
            errorMessage = "Speech recognition is off for Healyx. Turn it on in Settings to talk to Healyx."
            return false
        }
        let microphone: Bool
        #if os(iOS)
        microphone = await AVAudioApplication.requestRecordPermission()
        #else
        microphone = await AVCaptureDevice.requestAccess(for: .audio)
        #endif
        guard microphone else {
            errorMessage = "Microphone access is off for Healyx. Turn it on in Settings to talk to Healyx."
            return false
        }
        guard recognizer?.isAvailable == true else {
            errorMessage = "Speech recognition isn't available right now. Check your connection and try again."
            return false
        }
        return true
    }

    // MARK: Listening

    /// Starts live transcription. `onUpdate` gets the text so far. If `onPause` is set,
    /// it's called after about 1.5 seconds of silence (used by voice mode to auto-send).
    func startListening(onUpdate: @escaping (String) -> Void, onPause: (() -> Void)? = nil) async {
        guard !isListening else { return }
        stopSpeaking()
        guard await requestAccess(), let recognizer else { return }
        errorMessage = nil
        transcript = ""

        do {
            try configureAudio()

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
            self.request = request

            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            input.removeTap(onBus: 0)
            Self.installTap(on: input, format: format, request: request)
            if !engine.isRunning {
                engine.prepare()
                try engine.start()
            }
            isListening = true

            task = Self.recognitionTask(recognizer: recognizer, request: request) { [weak self] text, isFinal, failed in
                guard let self, self.isListening else { return }
                if let text {
                    self.transcript = text
                    onUpdate(text)
                    if let onPause { self.restartSilenceTimer(onPause) }
                }
                if isFinal || (failed && text == nil) {
                    self.stopListening()
                    if failed && self.transcript.isEmpty {
                        self.errorMessage = "Healyx didn't catch that. Try again."
                    }
                }
            }
        } catch {
            stopListening()
            errorMessage = "Healyx couldn't start the microphone. Try again."
        }
    }

    func stopListening() {
        silenceTimer?.cancel()
        silenceTimer = nil
        if engineConfigured || engine.isRunning { engine.inputNode.removeTap(onBus: 0) }
        if engine.isRunning && !isSpeaking { engine.stop() }
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        isListening = false
    }

    private func restartSilenceTimer(_ onPause: @escaping () -> Void) {
        silenceTimer?.cancel()
        silenceTimer = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            guard !Task.isCancelled, let self, self.isListening, !self.transcript.isEmpty else { return }
            self.stopListening()
            onPause()
        }
    }

    // MARK: Audio setup

    /// One engine for microphone and playback, with voice processing (echo
    /// cancellation) so the microphone doesn't pick up Healyx's own voice.
    private func configureAudio() throws {
        #if os(iOS)
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.duckOthers, .defaultToSpeaker, .allowBluetooth])
        try session.setActive(true, options: .notifyOthersOnDeactivation)
        #endif
        guard !engineConfigured else { return }
        if !engine.isRunning {
            try? engine.inputNode.setVoiceProcessingEnabled(true)
        }
        engine.attach(playerNode)
        engineConfigured = true
    }

    private func connectPlayer(for format: AVAudioFormat) {
        if let current = playerFormat, current == format { return }
        playerNode.stop()
        engine.disconnectNodeOutput(playerNode)
        engine.connect(playerNode, to: engine.mainMixerNode, format: format)
        playerFormat = format
    }

    // MARK: Speaking

    /// Reads a reply aloud in short pieces so speech starts quickly.
    /// `onFinished` runs when it ends on its own (not when stopped).
    /// `onBargeIn` runs if the person starts talking over it; playback stops first.
    func speak(_ text: String, onFinished: (() -> Void)? = nil, onBargeIn: (() -> Void)? = nil) {
        stopListening()
        stopSpeaking()
        let chunks = Self.chunks(Self.plainText(text))
        guard !chunks.isEmpty else { onFinished?(); return }
        onFinishedSpeaking = onFinished
        self.onBargeIn = onBargeIn
        isSpeaking = true
        if onBargeIn != nil { startBargeInMonitor() }

        speakTask = Task { @MainActor [weak self] in
            guard let self else { return }
            let api = self.api
            var next: Task<Data?, Never>? = Task { try? await api.tts(text: chunks[0], voice: Self.serverVoice) }
            for index in chunks.indices {
                guard !Task.isCancelled else { return }
                let audio = await next?.value
                next = index + 1 < chunks.count
                    ? Task { [chunk = chunks[index + 1]] in try? await api.tts(text: chunk, voice: Self.serverVoice) }
                    : nil
                guard !Task.isCancelled else { return }
                if let audio, await self.play(audio) { continue }
                // Server voice unavailable: say the rest with the best system voice.
                next?.cancel()
                await self.speakWithSystemVoice(chunks[index...].joined(separator: " "))
                break
            }
            guard !Task.isCancelled else { return }
            self.speechFinished()
        }
    }

    func stopSpeaking() {
        onFinishedSpeaking = nil
        onBargeIn = nil
        speakTask?.cancel()
        speakTask = nil
        if playerNode.isPlaying { playerNode.stop() }
        if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
        resumePlayback()
        resumeSystemSpeech()
        if isSpeaking && !isListening {
            engine.inputNode.removeTap(onBus: 0)
        }
        isSpeaking = false
        if engine.isRunning && !isListening { engine.stop() }
    }

    private func speechFinished() {
        guard isSpeaking else { return }
        let next = onFinishedSpeaking
        onFinishedSpeaking = nil
        onBargeIn = nil
        if !isListening { engine.inputNode.removeTap(onBus: 0) }
        isSpeaking = false
        if engine.isRunning && !isListening { engine.stop() }
        next?()
    }

    /// Plays one WAV clip through the engine. Returns false if it couldn't be played.
    private func play(_ wav: Data) async -> Bool {
        guard let buffer = Self.pcmBuffer(fromWAV: wav) else { return false }
        do {
            try configureAudio()
            connectPlayer(for: buffer.format)
            if !engine.isRunning {
                engine.prepare()
                try engine.start()
            }
        } catch {
            return false
        }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            playContinuation = continuation
            Self.schedule(buffer, on: playerNode) { [weak self] in self?.resumePlayback() }
            if !playerNode.isPlaying { playerNode.play() }
        }
        return true
    }

    private func resumePlayback() {
        let continuation = playContinuation
        playContinuation = nil
        continuation?.resume()
    }

    private func speakWithSystemVoice(_ text: String) async {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = Self.bestSystemVoice()
        utterance.rate = 0.5
        utterance.pitchMultiplier = 1.0
        utterance.prefersAssistiveTechnologySettings = false
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            systemSpeechContinuation = continuation
            synthesizer.speak(utterance)
        }
    }

    private func systemSpeechFinished() {
        resumeSystemSpeech()
    }

    private func resumeSystemSpeech() {
        let continuation = systemSpeechContinuation
        systemSpeechContinuation = nil
        continuation?.resume()
    }

    /// The most natural installed English voice: premium, then enhanced.
    static func bestSystemVoice() -> AVSpeechSynthesisVoice? {
        let english = AVSpeechSynthesisVoice.speechVoices().filter { $0.language == "en-US" }
        let favorites = ["Zoe", "Ava", "Evan", "Nathan", "Samantha"]
        for quality in [AVSpeechSynthesisVoiceQuality.premium, .enhanced] {
            let candidates = english.filter { $0.quality == quality }
            for name in favorites {
                if let voice = candidates.first(where: { $0.name.hasPrefix(name) }) { return voice }
            }
            if let voice = candidates.first { return voice }
        }
        return AVSpeechSynthesisVoice(language: "en-US")
    }

    // MARK: Barge-in

    /// Listens for the person's voice while Healyx speaks. Echo cancellation keeps
    /// Healyx's own voice out; sustained speech above the threshold interrupts.
    private func startBargeInMonitor() {
        do {
            try configureAudio()
            let input = engine.inputNode
            input.removeTap(onBus: 0)
            Self.installLevelTap(on: input, format: input.outputFormat(forBus: 0)) { [weak self] in
                self?.handleBargeIn()
            }
            if !engine.isRunning {
                engine.prepare()
                try engine.start()
            }
        } catch {
            // No barge-in this time; playback still works.
        }
    }

    private func handleBargeIn() {
        guard isSpeaking, let interrupt = onBargeIn else { return }
        stopSpeaking()
        interrupt()
    }

    // MARK: Text

    /// Splits text into speakable pieces: a short first piece so audio starts fast,
    /// then pieces of up to about 350 characters.
    static func chunks(_ text: String) -> [String] {
        var sentences: [String] = []
        text.enumerateSubstrings(in: text.startIndex..., options: .bySentences) { sentence, _, _, _ in
            if let sentence = sentence?.trimmingCharacters(in: .whitespacesAndNewlines), !sentence.isEmpty {
                sentences.append(sentence)
            }
        }
        if sentences.isEmpty {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? [] : [String(trimmed.prefix(1200))]
        }
        var result: [String] = []
        var current = ""
        for sentence in sentences {
            let limit = result.isEmpty ? 120 : 350
            if current.isEmpty {
                current = sentence
            } else if current.count + sentence.count + 1 <= limit {
                current += " " + sentence
            } else {
                result.append(current)
                current = sentence
            }
        }
        if !current.isEmpty { result.append(current) }
        return result.map { String($0.prefix(1200)) }
    }

    // MARK: Callbacks that run off the main thread

    // These are nonisolated so their closures aren't tied to the main actor:
    // the system calls them on its own audio and speech queues.

    private nonisolated static func speechAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in continuation.resume(returning: status) }
        }
    }

    private nonisolated static func installTap(on input: AVAudioInputNode, format: AVAudioFormat,
                                               request: SFSpeechAudioBufferRecognitionRequest) {
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }
    }

    private nonisolated static func schedule(_ buffer: AVAudioPCMBuffer, on node: AVAudioPlayerNode,
                                             completion: @escaping @MainActor () -> Void) {
        node.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { _ in
            Task { @MainActor in completion() }
        }
    }

    /// Calls `onSpeech` once when the input level stays above the threshold for about 0.3 s.
    private nonisolated static func installLevelTap(on input: AVAudioInputNode, format: AVAudioFormat,
                                                    onSpeech: @escaping @MainActor () -> Void) {
        let state = LevelState()
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return }
            var sum: Float = 0
            for index in 0..<Int(buffer.frameLength) { sum += samples[index] * samples[index] }
            let rms = (sum / Float(buffer.frameLength)).squareRoot()
            let seconds = Double(buffer.frameLength) / max(buffer.format.sampleRate, 1)
            if state.update(rms: rms, seconds: seconds) {
                Task { @MainActor in onSpeech() }
            }
        }
    }

    /// Reads a WAV clip into a PCM buffer.
    nonisolated static func pcmBuffer(fromWAV data: Data) -> AVAudioPCMBuffer? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("healyx-voice-\(UUID().uuidString).wav")
        defer { try? FileManager.default.removeItem(at: url) }
        do {
            try data.write(to: url)
            let file = try AVAudioFile(forReading: url)
            guard file.length > 0,
                  let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length))
            else { return nil }
            try file.read(into: buffer)
            return buffer
        } catch {
            return nil
        }
    }

    private nonisolated static func recognitionTask(
        recognizer: SFSpeechRecognizer, request: SFSpeechAudioBufferRecognitionRequest,
        handler: @escaping @MainActor (String?, Bool, Bool) -> Void
    ) -> SFSpeechRecognitionTask {
        recognizer.recognitionTask(with: request) { result, error in
            let text = result?.bestTranscription.formattedString
            let isFinal = result?.isFinal ?? false
            let failed = error != nil
            Task { @MainActor in handler(text, isFinal, failed) }
        }
    }

    /// Strips Markdown symbols so they aren't read out loud.
    static func plainText(_ text: String) -> String {
        var result = text
        for symbol in ["**", "__", "##", "#", "`", "*", "_", "> "] {
            result = result.replacingOccurrences(of: symbol, with: "")
        }
        // [label](link) -> label
        result = result.replacingOccurrences(of: #"\[([^\]]+)\]\([^)]+\)"#, with: "$1", options: .regularExpression)
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

/// Tracks how long the microphone level has stayed high (touched only on the audio thread).
private final class LevelState: @unchecked Sendable {
    private var loudSeconds = 0.0
    private var fired = false
    private let threshold: Float = 0.035

    func update(rms: Float, seconds: Double) -> Bool {
        guard !fired else { return false }
        loudSeconds = rms > threshold ? loudSeconds + seconds : max(0, loudSeconds - seconds)
        if loudSeconds >= 0.3 { fired = true; return true }
        return false
    }
}

private final class SpeechDelegate: NSObject, AVSpeechSynthesizerDelegate {
    var onFinish: (@Sendable () -> Void)?

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        onFinish?()
    }
}
