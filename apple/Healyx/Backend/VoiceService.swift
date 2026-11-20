import Foundation
import Observation
import AVFoundation
import Speech

/// Talking to Healyx: live dictation with Apple's speech recognizer, and replies
/// read aloud with the system voice. Speech is recognized by Apple (on the device
/// when it can be); Healyx only receives the finished text.
@MainActor
@Observable
final class VoiceService {
    private(set) var isListening = false
    private(set) var isSpeaking = false
    private(set) var transcript = ""
    var errorMessage: String?

    @ObservationIgnored private let recognizer = SFSpeechRecognizer(locale: Locale.current) ?? SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    @ObservationIgnored private let engine = AVAudioEngine()
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?
    @ObservationIgnored private var silenceTimer: Task<Void, Never>?
    @ObservationIgnored private let synthesizer = AVSpeechSynthesizer()
    @ObservationIgnored private var speechDelegate: SpeechDelegate?
    @ObservationIgnored private var onFinishedSpeaking: (() -> Void)?

    init() {
        let delegate = SpeechDelegate()
        delegate.onFinish = { [weak self] in
            Task { @MainActor in self?.speechFinished() }
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
            #if os(iOS)
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.duckOthers, .defaultToSpeaker, .allowBluetooth])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            #endif

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
            self.request = request

            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            input.removeTap(onBus: 0)
            Self.installTap(on: input, format: format, request: request)
            engine.prepare()
            try engine.start()
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
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
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

    // MARK: Speaking

    /// Reads a reply aloud. `onFinished` runs when it ends on its own (not when stopped).
    func speak(_ text: String, onFinished: (() -> Void)? = nil) {
        stopListening()
        let plain = Self.plainText(text)
        guard !plain.isEmpty else { onFinished?(); return }
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .default, options: [.duckOthers, .defaultToSpeaker, .allowBluetooth])
        try? AVAudioSession.sharedInstance().setActive(true)
        #endif
        onFinishedSpeaking = onFinished
        let utterance = AVSpeechUtterance(string: plain)
        utterance.voice = AVSpeechSynthesisVoice(language: Locale.current.identifier.replacingOccurrences(of: "_", with: "-"))
            ?? AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        isSpeaking = true
        synthesizer.speak(utterance)
    }

    func stopSpeaking() {
        onFinishedSpeaking = nil
        if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
        isSpeaking = false
    }

    private func speechFinished() {
        guard isSpeaking else { return }
        isSpeaking = false
        let next = onFinishedSpeaking
        onFinishedSpeaking = nil
        next?()
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

private final class SpeechDelegate: NSObject, AVSpeechSynthesizerDelegate {
    var onFinish: (@Sendable () -> Void)?

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        onFinish?()
    }
}
