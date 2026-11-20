import Foundation
import Observation
import Supabase
#if os(iOS)
import CoreLocation
import UserNotifications
#endif

/// The wearable picked during onboarding. A later Fitbit connector reads this.
enum WearableChoice: String, CaseIterable, Identifiable {
    case appleWatch, fitbit, oura, garmin, otherAppleHealth, none

    var id: String { rawValue }

    var title: String {
        switch self {
        case .appleWatch: return "Apple Watch"
        case .fitbit: return "Fitbit"
        case .oura: return "Oura"
        case .garmin: return "Garmin"
        case .otherAppleHealth: return "Other via Apple Health"
        case .none: return "I don't have a device"
        }
    }

    /// True when the device's data reaches Healyx through Apple Health.
    var usesAppleHealth: Bool {
        switch self {
        case .appleWatch, .oura, .garmin, .otherAppleHealth: return true
        case .fitbit, .none: return false
        }
    }
}

enum UnitSystem: String, CaseIterable, Identifiable {
    case imperial, metric
    var id: String { rawValue }
}

/// First-run onboarding state and the permission requests it makes.
@MainActor
@Observable
final class OnboardingStore {
    static let doneKey = "onboarding.done.v1"
    static let wearableKey = "onboarding.wearable"
    static let unitsKey = "units"

    var firstName = ""
    var wearable: WearableChoice? {
        didSet { UserDefaults.standard.set(wearable?.rawValue, forKey: Self.wearableKey) }
    }
    var units: UnitSystem = .imperial {
        didSet { UserDefaults.standard.set(units.rawValue, forKey: Self.unitsKey) }
    }
    private(set) var isSavingName = false
    var nameError: String?

    #if os(iOS)
    @ObservationIgnored private let locationManager = CLLocationManager()
    #endif

    init() {
        if let raw = UserDefaults.standard.string(forKey: Self.wearableKey) {
            wearable = WearableChoice(rawValue: raw)
        }
        if let raw = UserDefaults.standard.string(forKey: Self.unitsKey), let saved = UnitSystem(rawValue: raw) {
            units = saved
        }
    }

    static var isDone: Bool { UserDefaults.standard.bool(forKey: doneKey) }

    func markDone() {
        UserDefaults.standard.set(true, forKey: Self.doneKey)
    }

    /// Saves the first name to the account (the same `first_name` key sign-up uses).
    /// Returns false when it couldn't be saved; the flow still continues.
    @discardableResult
    func saveFirstName() async -> Bool {
        let name = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return false }
        isSavingName = true
        defer { isSavingName = false }
        do {
            _ = try await HealyxBackend.shared.supabase.auth.update(
                user: UserAttributes(data: ["first_name": .string(name)])
            )
            nameError = nil
            return true
        } catch {
            nameError = "Your name couldn't be saved right now. You can keep going."
            return false
        }
    }

    func requestNotifications() async {
        #if os(iOS)
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
        #endif
    }

    func requestLocation() {
        #if os(iOS)
        if locationManager.authorizationStatus == .notDetermined {
            locationManager.requestWhenInUseAuthorization()
        }
        #endif
    }
}
