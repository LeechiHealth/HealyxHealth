import SwiftUI
import Observation

/// The app's look follows the sun: a fresh sky by day, warm light at sunset,
/// violet twilight, then a midnight navy night. A gentle cue for a steady
/// circadian rhythm.
enum Daypart: String, Sendable {
    case dawn, day, golden, sunset, twilight, night

    /// 0 in full daylight, 1 at night.
    var nightness: Double {
        switch self {
        case .day: return 0
        case .golden: return 0.2
        case .dawn: return 0.3
        case .sunset: return 0.45
        case .twilight: return 0.75
        case .night: return 1
        }
    }

    /// Twilight and night use the dark tokens; everything else stays light.
    var isDark: Bool { self == .twilight || self == .night }

    var palette: CircadianPalette {
        switch self {
        case .dawn:
            return CircadianPalette(top: Color(hex: 0xFFD9C4), mid: Color(hex: 0xEADCF5), bottom: Color(hex: 0xF5F4F8))
        case .day:
            return CircadianPalette(top: Color(hex: 0xD3E9FF), mid: Color(hex: 0xEAE8FF), bottom: Color(hex: 0xF3F6F8))
        case .golden:
            return CircadianPalette(top: Color(hex: 0xFFE2B0), mid: Color(hex: 0xFCEBD8), bottom: Color(hex: 0xF7F3EE))
        case .sunset:
            return CircadianPalette(top: Color(hex: 0xFFB38A), mid: Color(hex: 0xF7A3C0), bottom: Color(hex: 0xF4E6F0))
        case .twilight:
            return CircadianPalette(top: Color(hex: 0x3B2F7A), mid: Color(hex: 0x1E1D52), bottom: Color(hex: 0x0D1030))
        case .night:
            return CircadianPalette(top: Color(hex: 0x0B1230), mid: Color(hex: 0x080D24), bottom: Color(hex: 0x05070F))
        }
    }
}

struct CircadianPalette: Equatable {
    let top: Color
    let mid: Color
    let bottom: Color
}

/// Sunrise and sunset for a date and place, from NOAA's solar equations.
struct SunTimes: Equatable {
    let sunrise: Date
    let sunset: Date

    /// Tampa, used until the app knows a rough location.
    static let fallbackLatitude = 28.06
    static let fallbackLongitude = -82.41

    /// UserDefaults keys for a rounded location (for example saved by the weather service).
    static let latitudeKey = "healyx.location.latitude"
    static let longitudeKey = "healyx.location.longitude"

    static func forDate(_ date: Date, latitude: Double, longitude: Double,
                        calendar: Calendar = .current) -> SunTimes {
        if let times = compute(date, latitude: latitude, longitude: longitude, calendar: calendar) {
            return times
        }
        // Polar day or night, or bad input: fixed times.
        let start = calendar.startOfDay(for: date)
        return SunTimes(sunrise: start.addingTimeInterval(6 * 3600 + 45 * 60),
                        sunset: start.addingTimeInterval(17 * 3600 + 40 * 60))
    }

    private static func compute(_ date: Date, latitude: Double, longitude: Double, calendar: Calendar) -> SunTimes? {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        guard let midnightUTC = utc.date(from: parts),
              let dayOfYear = utc.ordinality(of: .day, in: .year, for: midnightUTC) else { return nil }

        let gamma = 2 * Double.pi / 365 * Double(dayOfYear - 1)
        let eqTime = 229.18 * (0.000075 + 0.001868 * cos(gamma) - 0.032077 * sin(gamma)
                               - 0.014615 * cos(2 * gamma) - 0.040849 * sin(2 * gamma))
        let decl = 0.006918 - 0.399912 * cos(gamma) + 0.070257 * sin(gamma)
            - 0.006758 * cos(2 * gamma) + 0.000907 * sin(2 * gamma)
            - 0.002697 * cos(3 * gamma) + 0.00148 * sin(3 * gamma)
        let lat = latitude * .pi / 180
        let zenith = 90.833 * Double.pi / 180
        let cosHA = cos(zenith) / (cos(lat) * cos(decl)) - tan(lat) * tan(decl)
        guard cosHA >= -1, cosHA <= 1 else { return nil }
        let haDegrees = acos(cosHA) * 180 / .pi

        let sunriseMinutes = 720 - 4 * (longitude + haDegrees) - eqTime
        let sunsetMinutes = 720 - 4 * (longitude - haDegrees) - eqTime
        return SunTimes(sunrise: midnightUTC.addingTimeInterval(sunriseMinutes * 60),
                        sunset: midnightUTC.addingTimeInterval(sunsetMinutes * 60))
    }

    func daypart(at date: Date) -> Daypart {
        let minute: TimeInterval = 60
        if date >= sunrise - 45 * minute && date < sunrise + 45 * minute { return .dawn }
        if date >= sunset - 90 * minute && date < sunset - 30 * minute { return .golden }
        if date >= sunset - 30 * minute && date < sunset + 20 * minute { return .sunset }
        if date >= sunset + 20 * minute && date < sunset + 80 * minute { return .twilight }
        if date >= sunrise + 45 * minute && date < sunset - 90 * minute { return .day }
        return .night
    }
}

/// Ticks once a minute and says where the day is.
@MainActor
@Observable
final class CircadianClock {
    /// One shared clock, so views outside the environment (sheets, previews) still work.
    static let shared = CircadianClock()

    private(set) var now = Date()
    @ObservationIgnored private var timer: Timer?

    init() {
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.now = Date() }
        }
    }

    var sun: SunTimes {
        let defaults = UserDefaults.standard
        let lat = defaults.object(forKey: SunTimes.latitudeKey) as? Double ?? SunTimes.fallbackLatitude
        let lon = defaults.object(forKey: SunTimes.longitudeKey) as? Double ?? SunTimes.fallbackLongitude
        return SunTimes.forDate(now, latitude: lat, longitude: lon)
    }

    var daypart: Daypart { sun.daypart(at: now) }
    var nightness: Double { daypart.nightness }
    var palette: CircadianPalette { daypart.palette }
}

extension Appearance {
    /// The daypart the background should draw for this setting.
    @MainActor
    func daypart(clock: CircadianClock, systemScheme: ColorScheme) -> Daypart {
        switch self {
        case .circadian: return clock.daypart
        case .light: return .day
        case .dark: return .night
        case .system: return systemScheme == .dark ? .night : .day
        }
    }
}

/// Applies the color scheme for the chosen appearance, following the sun in
/// "Follows the sun" mode (dark at twilight and night).
struct CircadianColorScheme: ViewModifier {
    let appearance: Appearance
    private var clock: CircadianClock { CircadianClock.shared }

    func body(content: Content) -> some View {
        let scheme: ColorScheme?
        switch appearance {
        case .circadian: scheme = clock.daypart.isDark ? .dark : .light
        default: scheme = appearance.colorScheme
        }
        return content.preferredColorScheme(scheme)
    }
}

extension View {
    func circadianColorScheme(_ appearance: Appearance) -> some View {
        modifier(CircadianColorScheme(appearance: appearance))
    }
}

/// A faint, fixed star field for the night sky.
struct StarField: View {
    var opacity: Double = 1

    private static let stars: [(x: Double, y: Double, r: Double, a: Double)] = {
        var seed: UInt64 = 0x9E3779B97F4A7C15
        func next() -> Double {
            seed = seed &* 6364136223846793005 &+ 1442695040888963407
            return Double(seed >> 11) / Double(1 << 53)
        }
        return (0..<48).map { _ in (next(), next() * 0.7, 0.6 + next() * 1.2, 0.25 + next() * 0.55) }
    }()

    var body: some View {
        Canvas { context, size in
            for star in Self.stars {
                let rect = CGRect(x: star.x * size.width, y: star.y * size.height,
                                  width: star.r * 2, height: star.r * 2)
                context.fill(Path(ellipseIn: rect), with: .color(.white.opacity(star.a * opacity)))
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
