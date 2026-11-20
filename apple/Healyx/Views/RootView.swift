import SwiftUI
import HealyxKit

/// Chooses between the launch screen, sign-in and the app, and loads the
/// person's data whenever the signed-in user changes. The launch screen stays
/// up for at least 4 seconds on every cold launch so it can be seen.
struct RootView: View {
    @AppStorage("onboarding.done.v1") private var onboardingDone = false
    @Environment(SessionStore.self) private var session
    @Environment(RecordsStore.self) private var records
    @Environment(AgentsStore.self) private var agents
    @Environment(ChatStore.self) private var chat
    @Environment(AppRouter.self) private var router
    @Environment(WellnessStore.self) private var wellness

    @State private var launchHoldDone = false

    private static let launchHold: Duration = .seconds(4)

    private var sessionLoading: Bool {
        if case .loading = session.state { return true }
        return false
    }

    private var showLaunch: Bool { !launchHoldDone || sessionLoading }

    var body: some View {
        ZStack {
            if showLaunch {
                LaunchView()
                    .transition(.opacity.combined(with: .scale(scale: 1.04)))
                    .zIndex(1)
            } else {
                Group {
                    switch session.state {
                    case .loading:
                        LaunchView()
                    case .signedOut:
                        SignInView()
                    case .signedIn:
                        if onboardingDone {
                            MainView()
                        } else {
                            OnboardingFlow(onFinish: { onboardingDone = true })
                        }
                    }
                }
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.7), value: showLaunch)
        .task {
            try? await Task.sleep(for: Self.launchHold)
            launchHoldDone = true
        }
        .task(id: session.userID) {
            let records = self.records
            let agents = self.agents
            guard let userID = session.userID else {
                records.reset()
                agents.reset()
                chat.reset()
                wellness.reset()
                router.section = .guide
                return
            }
            async let recordsLoaded: Void = records.load(userID: userID)
            async let agentsLoaded: Void = agents.load(userID: userID)
            _ = await (recordsLoaded, agentsLoaded)
            wellness.updateBiologicalAge(records: records)
        }
    }
}

struct LaunchView: View {
    #if os(macOS)
    private let orbSize: CGFloat = 196
    #else
    private let orbSize: CGFloat = 164
    #endif

    var body: some View {
        ZStack {
            SkyBackground()
            FloatingHearts()
            VStack(spacing: 18) {
                FloatingOrb(size: orbSize)
                Text("healyx")
                    .font(.system(size: 44, weight: .bold, design: .rounded))
                    .tracking(-1)
                    .foregroundStyle(.white)
                    .shadow(color: Color(hex: 0x0B3D73).opacity(0.35), radius: 10, x: 0, y: 2)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Healyx")
    }
}

/// Floating glass buttons on iPhone and iPad, a sidebar on the Mac.
struct MainView: View {
    @Environment(AppRouter.self) private var router

    #if os(macOS)
    private var sidebarSelection: Binding<AppSection?> {
        Binding(get: { router.section }, set: { value in
            if let value { router.section = value }
        })
    }
    #endif

    var body: some View {
        #if os(macOS)
        NavigationSplitView {
            List(selection: sidebarSelection) {
                ForEach(AppSection.allCases) { section in
                    Label(section.title, systemImage: section.symbol).tag(section)
                }
            }
            .navigationSplitViewColumnWidth(min: 200, ideal: 220)
            .safeAreaInset(edge: .bottom) {
                HStack(spacing: 8) {
                    HealyxMark(size: 22)
                    Text("healyx").font(.headline)
                    Spacer()
                    AccountMenu()
                }
                .padding(12)
            }
        } detail: {
            NavigationStack {
                SectionView(section: router.section)
            }
            .id(router.section)
        }
        #else
        NavigationStack {
            SectionView(section: router.section)
        }
        .id(router.section)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if router.section != .guide {
                GlassBar()
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .overlay(alignment: .topLeading) {
            // The chat has no bar, so a small glass Home button sits in its corner.
            if router.section == .guide {
                GlassHomeButton()
                    .padding(.leading, 16)
                    .padding(.top, 4)
                    .transition(.opacity)
            }
        }
        .animation(.snappy, value: router.section)
        #endif
    }
}

struct SectionView: View {
    let section: AppSection

    var body: some View {
        switch section {
        case .home: HomeView()
        case .guide: ChatView()
        case .records: RecordsView()
        case .agents: AgentsView()
        }
    }
}

/// Appearance, the website link and sign-out.
struct AccountMenu: View {
    @Environment(SessionStore.self) private var session
    @AppStorage(Appearance.storageKey) private var appearance: Appearance = .circadian

    var body: some View {
        Menu {
            if let email = session.email {
                Text(email)
            }
            Picker("Appearance", selection: $appearance) {
                ForEach(Appearance.allCases) { option in
                    Text(option.label).tag(option)
                }
            }
            Link("Open Healyx on the web", destination: AppConfig.apiBaseURL)
            Divider()
            Button("Sign out", role: .destructive) {
                Task { await session.signOut() }
            }
        } label: {
            Image(systemName: "person.crop.circle.fill")
                .font(.title2)
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(Theme.primary)
                .accessibilityLabel("Account")
        }
        #if os(macOS)
        .menuStyle(.button)
        .buttonStyle(.borderless)
        .menuIndicator(.hidden)
        .fixedSize()
        #endif
    }
}
