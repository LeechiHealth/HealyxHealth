import SwiftUI

/// The welcome screen: a bright sky full of floating Healyx hearts, the Healyx orb
/// in the middle, and two pills at the bottom. Email sign-in opens in a sheet.
struct SignInView: View {
    @Environment(SessionStore.self) private var session
    @State private var sheet: EmailSheetMode?

    #if os(macOS)
    private let orbSize: CGFloat = 196
    #else
    private let orbSize: CGFloat = 164
    #endif

    var body: some View {
        ZStack {
            SkyBackground()
            FloatingHearts()

            VStack(spacing: 0) {
                Spacer(minLength: 32)

                FloatingOrb(size: orbSize)

                Text("Meet Healyx,\nyour health records with a guide built in.")
                    .font(.system(size: 28, weight: .semibold))
                    .tracking(-0.4)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white)
                    .shadow(color: Color(hex: 0x0B3D73).opacity(0.35), radius: 10, x: 0, y: 2)
                    .padding(.horizontal, 32)
                    .padding(.top, 30)
                    .frame(maxWidth: 520)

                Spacer(minLength: 32)

                VStack(spacing: 12) {
                    // Continue with Apple and Continue with Google go here once those
                    // providers are switched on in Supabase (Apple needs the paid
                    // Apple Developer account).
                    Button { sheet = .signIn } label: {
                        Label("Sign in with email", systemImage: "envelope.fill")
                    }
                    .buttonStyle(PillButtonStyle(kind: .white))

                    Button { sheet = .createAccount } label: {
                        Label("Create an account", systemImage: "person.crop.circle.badge.plus")
                    }
                    .buttonStyle(PillButtonStyle(kind: .ink))

                    Text("Educational information, not diagnosis or treatment.")
                        .font(.caption)
                        .foregroundStyle(Color(hex: 0x24476B))
                        .padding(.top, 4)
                }
                .frame(maxWidth: 380)
                .padding(.horizontal, 24)
                .padding(.bottom, 18)
            }
        }
        .sheet(item: $sheet) { mode in
            EmailSignInSheet(startMode: mode)
                .environment(session)
        }
    }
}

enum EmailSheetMode: String, Identifiable {
    case signIn, createAccount
    var id: String { rawValue }
}

// MARK: - Sky

/// The bright sky behind the welcome and launch screens.
struct SkyBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(stops: [
                .init(color: Theme.skyTop, location: 0),
                .init(color: Theme.skyMid, location: 0.48),
                .init(color: Theme.skyLow, location: 0.8),
                .init(color: Theme.skyHaze, location: 1),
            ], startPoint: .top, endPoint: .bottom)

            GeometryReader { geo in
                let span = min(geo.size.width, 720)
                ForEach(SkyCloud.all) { cloud in
                    Cloud(width: span * cloud.width)
                        .opacity(cloud.opacity)
                        .position(x: geo.size.width * cloud.x, y: geo.size.height * cloud.y)
                }
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

private struct SkyCloud: Identifiable {
    let id: Int
    let x: CGFloat
    let y: CGFloat
    let width: CGFloat
    let opacity: Double

    static let all: [SkyCloud] = [
        SkyCloud(id: 0, x: 0.16, y: 0.2, width: 0.6, opacity: 0.45),
        SkyCloud(id: 1, x: 0.88, y: 0.36, width: 0.5, opacity: 0.4),
        SkyCloud(id: 2, x: 0.28, y: 0.62, width: 0.75, opacity: 0.5),
        SkyCloud(id: 3, x: 0.94, y: 0.76, width: 0.7, opacity: 0.65),
        SkyCloud(id: 4, x: 0.08, y: 0.9, width: 0.95, opacity: 0.85),
        SkyCloud(id: 5, x: 0.68, y: 0.99, width: 1.05, opacity: 0.95),
    ]
}

/// A soft, blurred cloud built from a capsule and two puffs.
private struct Cloud: View {
    let width: CGFloat

    var body: some View {
        ZStack(alignment: .bottom) {
            Capsule()
                .frame(width: width, height: width * 0.28)
            Circle()
                .frame(width: width * 0.42, height: width * 0.42)
                .offset(x: -width * 0.14, y: -width * 0.08)
            Circle()
                .frame(width: width * 0.32, height: width * 0.32)
                .offset(x: width * 0.18, y: -width * 0.05)
        }
        .foregroundStyle(Color.white)
        .frame(width: width, height: width * 0.5, alignment: .bottom)
        .blur(radius: width * 0.05)
    }
}

// MARK: - Floating hearts

/// One floating object: the app icon, a white heart, or a small Healyx orb.
private struct Floater: Identifiable {
    enum Kind { case tile, heart, orb }

    let id: Int
    let kind: Kind
    /// Position as a fraction of the screen.
    let x: CGFloat
    let y: CGFloat
    /// Size in points on a phone.
    let size: CGFloat
    let rotation: Double
    /// 1 is closest. Farther objects are softer and drift less.
    let depth: CGFloat

    var period: Double { 3.2 + Double(id % 4) * 0.7 }
    var amplitude: CGFloat { 4 + 8 * depth }

    static let all: [Floater] = [
        Floater(id: 0, kind: .tile, x: 0.14, y: 0.09, size: 62, rotation: -14, depth: 1),
        Floater(id: 1, kind: .heart, x: 0.85, y: 0.07, size: 54, rotation: 12, depth: 0.9),
        Floater(id: 2, kind: .heart, x: 0.5, y: 0.04, size: 26, rotation: -8, depth: 0.45),
        Floater(id: 3, kind: .orb, x: 0.36, y: 0.17, size: 30, rotation: 0, depth: 0.55),
        Floater(id: 4, kind: .tile, x: 0.89, y: 0.25, size: 72, rotation: 16, depth: 1),
        Floater(id: 5, kind: .heart, x: 0.07, y: 0.31, size: 44, rotation: -20, depth: 0.75),
        Floater(id: 6, kind: .tile, x: 0.69, y: 0.14, size: 30, rotation: 10, depth: 0.5),
        Floater(id: 7, kind: .orb, x: 0.94, y: 0.47, size: 40, rotation: 0, depth: 0.7),
        Floater(id: 8, kind: .heart, x: 0.09, y: 0.54, size: 58, rotation: 18, depth: 0.9),
        Floater(id: 9, kind: .tile, x: 0.17, y: 0.73, size: 46, rotation: -10, depth: 0.8),
        Floater(id: 10, kind: .heart, x: 0.87, y: 0.67, size: 50, rotation: -16, depth: 0.85),
        Floater(id: 11, kind: .orb, x: 0.6, y: 0.77, size: 24, rotation: 0, depth: 0.5),
    ]
}

struct FloatingHearts: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            let scale = Self.scale(for: geo.size)
            TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion)) { context in
                let time = context.date.timeIntervalSinceReferenceDate
                ZStack {
                    ForEach(Floater.all) { item in
                        FloaterView(item: item, size: item.size * scale)
                            .rotationEffect(.degrees(item.rotation + tilt(item, time)))
                            .position(x: geo.size.width * item.x,
                                      y: geo.size.height * item.y + bob(item, time))
                    }
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private static func scale(for size: CGSize) -> CGFloat {
        min(max(min(size.width, size.height) / 400, 0.85), 1.5)
    }

    private func bob(_ item: Floater, _ time: Double) -> CGFloat {
        guard !reduceMotion else { return 0 }
        return CGFloat(sin(time * 2 * .pi / item.period + Double(item.id) * 1.3)) * item.amplitude
    }

    private func tilt(_ item: Floater, _ time: Double) -> Double {
        guard !reduceMotion else { return 0 }
        return sin(time * 0.6 + Double(item.id)) * 4
    }
}

private struct FloaterView: View {
    let item: Floater
    let size: CGFloat

    private let shadowColor = Color(hex: 0x0B4C8C)

    var body: some View {
        content
            .blur(radius: (1 - item.depth) * 5)
            .opacity(0.55 + 0.45 * item.depth)
    }

    @ViewBuilder private var content: some View {
        switch item.kind {
        case .tile:
            Image("HealyxIcon")
                .resizable()
                .scaledToFill()
                .frame(width: size, height: size)
                .clipShape(RoundedRectangle(cornerRadius: size * 0.24, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: size * 0.24, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.35), lineWidth: 1)
                )
                .shadow(color: shadowColor.opacity(0.35), radius: size * 0.16, x: 0, y: size * 0.12)
        case .heart:
            Image("HealyxMarkWhite")
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
                .shadow(color: shadowColor.opacity(0.35), radius: size * 0.08, x: 0, y: size * 0.08)
        case .orb:
            HealyxOrb(size: size)
        }
    }
}

/// The big Healyx orb, drifting gently, with a soft halo behind it.
struct FloatingOrb: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let size: CGFloat

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion)) { context in
            HealyxOrb(size: size)
                .offset(y: drift(context.date.timeIntervalSinceReferenceDate))
        }
        .frame(width: size, height: size + 20)
        .background {
            Circle()
                .fill(Color.white.opacity(0.35))
                .frame(width: size * 1.45, height: size * 1.45)
                .blur(radius: size * 0.18)
        }
    }

    private func drift(_ time: Double) -> CGFloat {
        guard !reduceMotion else { return 0 }
        return CGFloat(sin(time * 0.9)) * 8
    }
}

// MARK: - Email sign-in

private struct EmailSignInSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var creatingAccount: Bool
    @State private var firstName = ""
    @State private var email = ""
    @State private var password = ""

    init(startMode: EmailSheetMode) {
        _creatingAccount = State(initialValue: startMode == .createAccount)
    }

    private var canSubmit: Bool {
        email.contains("@") && password.count >= 6 && !session.isWorking
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack {
                    HealyxMark(size: 40)
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(Theme.muted)
                            .frame(width: 32, height: 32)
                            .background(Theme.secondary, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Close")
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text(creatingAccount ? "Create your account" : "Welcome back")
                        .font(.title.weight(.semibold))
                        .tracking(-0.5)
                    Text(creatingAccount
                         ? "One account for the website, your iPhone and your Mac."
                         : "Sign in with your Healyx email and password.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                }

                VStack(spacing: 12) {
                    if creatingAccount {
                        field("First name", text: $firstName)
                            #if os(iOS)
                            .textContentType(.givenName)
                            #endif
                    }
                    field("Email", text: $email)
                        .textContentType(.username)
                        #if os(iOS)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        #endif
                        .autocorrectionDisabled()

                    SecureField("Password", text: $password)
                        #if os(iOS)
                        .textContentType(creatingAccount ? .newPassword : .password)
                        #else
                        .textContentType(.password)
                        #endif
                        .textFieldStyle(.plain)
                        .padding(15)
                        .background(Theme.secondary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .onSubmit(submit)
                }

                if let error = session.errorMessage {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(Theme.destructive)
                }
                if let notice = session.noticeMessage {
                    Text(notice)
                        .font(.footnote)
                        .foregroundStyle(Theme.primary)
                }

                Button(action: submit) {
                    if session.isWorking {
                        ProgressView().tint(Theme.onPrimary)
                    } else {
                        Text(creatingAccount ? "Create account" : "Sign in")
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!canSubmit)

                HStack {
                    Button(creatingAccount ? "I have an account" : "Create an account") {
                        creatingAccount.toggle()
                        session.errorMessage = nil
                        session.noticeMessage = nil
                    }
                    Spacer()
                    if !creatingAccount {
                        Button("Forgot password?") {
                            Task { await session.sendPasswordReset(email: email) }
                        }
                    }
                }
                .font(.footnote.weight(.semibold))
                .buttonStyle(.plain)
                .foregroundStyle(Theme.primary)

                Text("Healyx gives educational information, not diagnosis or treatment. Your records are private to your account.")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
            .padding(24)
        }
        .onAppear {
            session.errorMessage = nil
            session.noticeMessage = nil
        }
        #if os(iOS)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(32)
        .presentationBackground(Theme.card)
        #else
        .frame(width: 440, height: 580)
        .background(Theme.card)
        #endif
    }

    private func field(_ title: String, text: Binding<String>) -> some View {
        TextField(title, text: text)
            .textFieldStyle(.plain)
            .padding(15)
            .background(Theme.secondary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func submit() {
        guard canSubmit else { return }
        Task {
            if creatingAccount {
                await session.signUp(firstName: firstName, email: email, password: password)
            } else {
                await session.signIn(email: email, password: password)
            }
        }
    }
}
