import SwiftUI

@main
struct HealyxApp: App {
    @State private var session = SessionStore()
    @State private var records = RecordsStore()
    @State private var chat = ChatStore()
    @State private var agents = AgentsStore()
    @State private var router = AppRouter()
    @State private var wellness = WellnessStore()
    @AppStorage(Appearance.storageKey) private var appearance: Appearance = .circadian

    init() {
        // Store the default once, so every screen reading this key agrees.
        if UserDefaults.standard.string(forKey: Appearance.storageKey) == nil {
            UserDefaults.standard.set(Appearance.circadian.rawValue, forKey: Appearance.storageKey)
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(records)
                .environment(chat)
                .environment(agents)
                .environment(router)
                .environment(wellness)
                .environment(CircadianClock.shared)
                .tint(Theme.primary)
                .circadianColorScheme(appearance)
        }
        #if os(macOS)
        .defaultSize(width: 1180, height: 800)
        #endif
    }
}

/// Follows the sun (the default), light, dark, or follow the system.
enum Appearance: String, CaseIterable, Identifiable {
    case circadian, system, light, dark

    /// A new key, so everyone starts on the time-of-day look once.
    static let storageKey = "appearance.v3"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .circadian: return "Follows the sun"
        case .system: return "System"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }

    /// For "Follows the sun", the scheme comes from CircadianColorScheme instead.
    var colorScheme: ColorScheme? {
        switch self {
        case .circadian, .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}
