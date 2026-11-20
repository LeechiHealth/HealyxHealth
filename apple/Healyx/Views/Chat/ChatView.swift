import SwiftUI
import PhotosUI
import HealyxKit
#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// Ask Healyx: a conversation that knows the person's saved records.
/// Type, dictate, talk hands-free in voice mode, or send up to three photos.
struct ChatView: View {
    @Environment(ChatStore.self) private var chat
    @Environment(AppRouter.self) private var router
    @Environment(SessionStore.self) private var session

    @State private var draft = ""
    @State private var attachments: [Data] = []
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var showPhotoPicker = false
    @State private var showCamera = false
    @State private var voice = VoiceService()
    @State private var voiceMode = false
    @FocusState private var inputFocused: Bool

    private let ink = Color(hex: 0x111827)

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        if chat.messages.isEmpty {
                            welcome
                        }
                        ForEach(chat.messages) { message in
                            MessageBubble(role: message.role, text: message.text, isError: message.isError,
                                          images: message.images, showsBuddy: true)
                                .id(message.id)
                        }
                        if chat.isSending {
                            HStack(alignment: .bottom, spacing: 8) {
                                HealyxBuddy(size: 26, mood: .thinking)
                                TypingIndicator()
                            }
                            .id("typing")
                        }
                        if let error = voice.errorMessage {
                            ErrorBanner(message: error) { voice.errorMessage = nil }
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: 760)
                    .frame(maxWidth: .infinity)
                }
                #if os(iOS)
                .scrollDismissesKeyboard(.interactively)
                #endif
                .onChange(of: chat.messages.count) {
                    if let last = chat.messages.last?.id {
                        withAnimation { proxy.scrollTo(last, anchor: .bottom) }
                    }
                }
                .onChange(of: chat.isSending) {
                    if chat.isSending { withAnimation { proxy.scrollTo("typing", anchor: .bottom) } }
                }
            }
            if voiceMode {
                voicePanel
            } else {
                composer
            }
        }
        .background { ChatBackground() }
        #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker(isPresented: $showCamera) { data in
                if attachments.count < 3 { attachments.append(data) }
            }
            .ignoresSafeArea()
        }
        #endif
        .photosPicker(isPresented: $showPhotoPicker, selection: $pickerItems,
                      maxSelectionCount: max(1, 3 - attachments.count), matching: .images)
        .onChange(of: pickerItems) { loadPickedPhotos() }
        .task(id: router.pendingQuestion) {
            guard let question = router.pendingQuestion else { return }
            router.pendingQuestion = nil
            await chat.send(question)
        }
        .onDisappear { endVoice() }
    }

    // MARK: Top bar

    private var topBar: some View {
        HStack {
            Menu {
                Button("New chat", systemImage: "square.and.pencil") {
                    endVoice()
                    chat.reset()
                    attachments = []
                }
                .disabled(chat.messages.isEmpty || chat.isSending)
            } label: {
                circleIcon("line.3.horizontal")
            }
            #if os(macOS)
            .menuStyle(.button)
            .buttonStyle(.borderless)
            .menuIndicator(.hidden)
            .fixedSize()
            #endif
            .accessibilityLabel("Chat menu")

            Spacer()
            if !chat.messages.isEmpty {
                Text("Ask Healyx").font(.headline).foregroundStyle(Theme.foreground)
            }
            Spacer()

            Button {
                endVoice()
                router.section = .home
            } label: {
                circleIcon("xmark")
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }

    private func circleIcon(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(.body.weight(.semibold))
            .foregroundStyle(Theme.foreground)
            .frame(width: 40, height: 40)
            .background(Theme.card.opacity(0.85), in: Circle())
            .shadow(color: Theme.shadow.opacity(0.08), radius: 8, x: 0, y: 3)
    }

    // MARK: Empty state

    private var welcome: some View {
        VStack(spacing: 12) {
            HealyxBuddy(size: 96, mood: chat.isSending ? .thinking : .idle)
            Text(Date.now, format: .dateTime.weekday(.abbreviated).month(.abbreviated).day())
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
            Text("Welcome back\(session.firstName.map { ", \($0)" } ?? "")!")
                .font(.title2.weight(.semibold))
                .foregroundStyle(Theme.foreground)
            Text("Ask about your labs, medications and records by typing, talking or sending a photo. Healyx gives educational information, not diagnosis or treatment.")
                .font(.footnote)
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)
            HStack(spacing: 12) {
                suggestion("Explain my labs", detail: "What stands out in my latest results",
                           symbol: "testtube.2", prompt: "What stands out in my latest labs, in plain words?")
                suggestion("Prep my checkup", detail: "Questions to ask my doctor",
                           symbol: "stethoscope", prompt: "What should I ask at my next checkup, based on my records?")
            }
            .frame(maxWidth: 520)
            .padding(.top, 10)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 36)
        .padding(.bottom, 12)
    }

    private func suggestion(_ title: String, detail: String, symbol: String, prompt: String) -> some View {
        Button {
            send(text: prompt)
        } label: {
            HStack(alignment: .top, spacing: 10) {
                IconBadge(symbol: symbol, color: Theme.indigo, size: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.foreground)
                    Text(detail).font(.caption).foregroundStyle(Theme.muted).lineLimit(2)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card.opacity(0.9), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: Theme.shadow.opacity(0.06), radius: 10, x: 0, y: 4)
        }
        .buttonStyle(.plain)
        .disabled(chat.isSending)
    }

    // MARK: Composer

    private var canSend: Bool {
        (!draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.isEmpty) && !chat.isSending
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !attachments.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(attachments.enumerated()), id: \.offset) { index, data in
                            thumbnail(data)
                                .overlay(alignment: .topTrailing) {
                                    Button {
                                        attachments.remove(at: index)
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .font(.body)
                                            .symbolRenderingMode(.palette)
                                            .foregroundStyle(Color.white, Color.black.opacity(0.6))
                                    }
                                    .buttonStyle(.plain)
                                    .padding(3)
                                    .accessibilityLabel("Remove photo")
                                }
                        }
                    }
                }
            }

            TextField(voice.isListening ? "Listening…" : "Ask Healyx anything", text: $draft, axis: .vertical)
                .lineLimit(1...5)
                .focused($inputFocused)
                .textFieldStyle(.plain)
                .onSubmit { send() }

            HStack(spacing: 10) {
                Menu {
                    Button("Choose photos", systemImage: "photo.on.rectangle") { showPhotoPicker = true }
                    #if os(iOS)
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        Button("Take photo", systemImage: "camera") { showCamera = true }
                    }
                    #endif
                } label: {
                    composerIcon("plus")
                }
                #if os(macOS)
                .menuStyle(.button)
                .buttonStyle(.borderless)
                .menuIndicator(.hidden)
                .fixedSize()
                #endif
                .disabled(attachments.count >= 3 || chat.isSending)
                .accessibilityLabel("Add a photo")

                Spacer()

                Button(action: toggleDictation) {
                    composerIcon(voice.isListening ? "mic.fill" : "mic", tint: voice.isListening ? Theme.primary : Theme.muted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(voice.isListening ? "Stop dictation" : "Dictate")

                Button(action: startVoiceMode) {
                    composerIcon("waveform")
                }
                .buttonStyle(.plain)
                .disabled(chat.isSending)
                .accessibilityLabel("Talk to Healyx")

                Button { send() } label: {
                    Image(systemName: "arrow.up")
                        .font(.body.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 36, height: 36)
                        .background(ink.opacity(canSend ? 1 : 0.3), in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(!canSend)
                .keyboardShortcut(.return, modifiers: .command)
                .accessibilityLabel("Send")
            }
        }
        .padding(14)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).strokeBorder(Theme.border.opacity(0.6), lineWidth: 0.5))
        .shadow(color: Theme.shadow.opacity(0.1), radius: 18, x: 0, y: 6)
        .padding(.horizontal, 14)
        .padding(.bottom, 10)
        .padding(.top, 4)
        .frame(maxWidth: 760)
        .frame(maxWidth: .infinity)
    }

    private func composerIcon(_ symbol: String, tint: Color = Theme.muted) -> some View {
        Image(systemName: symbol)
            .font(.body.weight(.semibold))
            .foregroundStyle(tint)
            .frame(width: 34, height: 34)
            .background(Theme.secondary, in: Circle())
    }

    @ViewBuilder private func thumbnail(_ data: Data) -> some View {
        if let image = platformImage(data) {
            image
                .resizable()
                .scaledToFill()
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    // MARK: Voice mode

    private var voiceMood: HealyxBuddy.Mood {
        if voice.isListening { return .listening }
        if chat.isSending { return .thinking }
        if voice.isSpeaking { return .speaking }
        return .idle
    }

    private var voiceStatus: String {
        switch voiceMood {
        case .listening: return "Listening…"
        case .thinking: return "Thinking…"
        case .speaking: return "Speaking…"
        case .idle: return "Getting ready…"
        }
    }

    private var voicePanel: some View {
        VStack(spacing: 10) {
            HealyxBuddy(size: 104, mood: voiceMood)
            Text(voiceStatus).font(.headline).foregroundStyle(Theme.foreground)
            if voice.isListening && !voice.transcript.isEmpty {
                Text(voice.transcript)
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
            } else if voice.isListening {
                Text("Talk naturally. Healyx sends it when you pause.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
            HStack(spacing: 12) {
                if voice.isSpeaking {
                    Button {
                        voice.stopSpeaking()
                        listenAgain()
                    } label: {
                        Label("Stop talking", systemImage: "stop.fill")
                    }
                    .buttonStyle(.bordered)
                }
                Button(action: endVoice) {
                    Label("End voice", systemImage: "xmark")
                }
                .buttonStyle(.borderedProminent)
                .tint(ink)
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
        .padding(18)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .shadow(color: Theme.shadow.opacity(0.1), radius: 18, x: 0, y: 6)
        .padding(.horizontal, 14)
        .padding(.bottom, 10)
        .frame(maxWidth: 760)
        .frame(maxWidth: .infinity)
    }

    private func startVoiceMode() {
        inputFocused = false
        voice.errorMessage = nil
        voiceMode = true
        listenAgain()
    }

    private func listenAgain() {
        guard voiceMode else { return }
        Task {
            await voice.startListening(onUpdate: { text in draft = text }, onPause: { sendVoiceTurn() })
            if !voice.isListening && voice.errorMessage != nil { voiceMode = false }
        }
    }

    private func sendVoiceTurn() {
        let text = draft
        let images = attachments
        draft = ""
        attachments = []
        Task {
            let reply = await chat.send(text, images: images)
            guard voiceMode else { return }
            if let reply {
                voice.speak(reply) { listenAgain() }
            } else {
                listenAgain()
            }
        }
    }

    private func endVoice() {
        voiceMode = false
        voice.stopListening()
        voice.stopSpeaking()
    }

    private func toggleDictation() {
        if voice.isListening {
            voice.stopListening()
            return
        }
        let base = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            await voice.startListening(onUpdate: { text in
                draft = base.isEmpty ? text : base + " " + text
            })
        }
    }

    // MARK: Sending

    private func send() {
        send(text: draft)
    }

    private func send(text: String) {
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (!message.isEmpty || !attachments.isEmpty), !chat.isSending else { return }
        let images = attachments
        draft = ""
        attachments = []
        if voice.isListening { voice.stopListening() }
        Task { await chat.send(message, images: images) }
    }

    private func loadPickedPhotos() {
        let items = pickerItems
        guard !items.isEmpty else { return }
        pickerItems = []
        Task {
            for item in items {
                guard attachments.count < 3 else { break }
                if let data = try? await item.loadTransferable(type: Data.self) {
                    attachments.append(data)
                }
            }
        }
    }
}

/// The soft lavender wash behind the chat.
private struct ChatBackground: View {
    var body: some View {
        LinearGradient(colors: [Color(light: 0xE6E1FF, dark: 0x171A33),
                                Color(light: 0xF3F1FF, dark: 0x10142A),
                                Theme.background],
                       startPoint: .top, endPoint: .bottom)
            .ignoresSafeArea()
    }
}

/// Turns photo data into a SwiftUI image.
func platformImage(_ data: Data) -> Image? {
    #if os(iOS)
    return UIImage(data: data).map { Image(uiImage: $0) }
    #else
    return NSImage(data: data).map { Image(nsImage: $0) }
    #endif
}

#if os(iOS)
/// The system camera, for taking a photo to send to Healyx.
struct CameraPicker: UIViewControllerRepresentable {
    @Binding var isPresented: Bool
    let onImage: (Data) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    @MainActor
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker

        init(_ parent: CameraPicker) {
            self.parent = parent
        }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage, let data = image.jpegData(compressionQuality: 0.9) {
                parent.onImage(data)
            }
            parent.isPresented = false
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.isPresented = false
        }
    }
}
#endif

// MARK: - Shared chat pieces (also used by agents)

struct MessageBubble: View {
    let role: ChatRole
    let text: String
    var isError = false
    var images: [Data] = []
    /// Shows the small Healyx orb next to replies.
    var showsBuddy = false

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if role == .user { Spacer(minLength: 48) }
            if role == .assistant && showsBuddy {
                HealyxBuddy(size: 26, animated: false)
            }
            VStack(alignment: role == .user ? .trailing : .leading, spacing: 6) {
                if !images.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(Array(images.enumerated()), id: \.offset) { _, data in
                            if let image = platformImage(data) {
                                image
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 96, height: 96)
                                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            }
                        }
                    }
                }
                Text(markdown(text))
                    .font(.body)
                    .textSelection(.enabled)
                    .foregroundStyle(role == .user ? Theme.onPrimary : (isError ? Theme.destructive : Theme.foreground))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(background, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .shadow(color: role == .assistant ? Theme.shadow.opacity(0.06) : .clear, radius: 8, x: 0, y: 3)
            }
            if role == .assistant { Spacer(minLength: 48) }
        }
    }

    private var background: Color {
        if role == .user { return Theme.primary }
        return isError ? Theme.destructive.opacity(0.08) : Theme.card
    }
}

struct TypingIndicator: View {
    @State private var phase = 0.0

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(Theme.muted)
                    .frame(width: 7, height: 7)
                    .opacity(0.35 + 0.65 * abs(sin(phase + Double(index) * 0.6)))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .onAppear {
            withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) { phase = .pi }
        }
        .accessibilityLabel("Thinking")
    }
}

struct InputBar: View {
    @Binding var text: String
    let placeholder: String
    let isSending: Bool
    var focused: FocusState<Bool>.Binding
    let onSend: () -> Void

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSending
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField(placeholder, text: $text, axis: .vertical)
                .lineLimit(1...5)
                .focused(focused)
                .textFieldStyle(.plain)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Theme.secondary, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .onSubmit { if canSend { onSend() } }
            Button(action: onSend) {
                Image(systemName: "arrow.up")
                    .font(.body.weight(.bold))
                    .foregroundStyle(Theme.onPrimary)
                    .frame(width: 38, height: 38)
                    .background(Theme.primary.opacity(canSend ? 1 : 0.35), in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
            .keyboardShortcut(.return, modifiers: .command)
            .accessibilityLabel("Send")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.bar)
    }
}
