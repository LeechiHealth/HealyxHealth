import Foundation

/// What the person is up to, set from Home. Saved on this device.
enum ActivityStatus: String, CaseIterable, Identifiable {
    case active, resting, sick, traveling

    static let storageKey = "activity.status"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .active: return "Active"
        case .resting: return "Resting"
        case .sick: return "Sick"
        case .traveling: return "Traveling"
        }
    }

    var symbol: String {
        switch self {
        case .active: return "figure.run"
        case .resting: return "bed.double.fill"
        case .sick: return "cross.case.fill"
        case .traveling: return "airplane"
        }
    }
}
