import Foundation

/// Something the person told Ask Healyx about themselves that should be saved
/// to their account ("I slept 11 to 6:30", "I started metformin 500 mg").
/// The server only describes it; the app writes it with the person's own session.
public enum ChatAction: Hashable, Sendable {
    case sleep(bedtime: Date, wakeTime: Date, minutesToFallAsleep: Int?, wakeUps: Int?, minutesAwake: Int?, quality: Int?)
    case stress(rating: Int)
    case meal(name: String, kcal: Double?, proteinG: Double?, carbsG: Double?, fatG: Double?, fiberG: Double?)
    case water(ml: Double)
    case vital(kind: VitalChatKind, value: Double, value2: Double?)
    case addMedication(name: String, dose: String?, frequency: String?, startedOn: String?)
    case stopMedication(name: String)
    case addCondition(name: String, diagnosedOn: String?)
    case addLab(name: String, value: Double?, valueText: String, unit: String?, range: String?, date: String?)

    public enum VitalChatKind: String, Hashable, Sendable {
        case weight, bloodPressure = "blood_pressure", restingHR = "resting_hr", hrv, temperature
    }

    /// Reads one action from the server's JSON. Unknown or incomplete actions give nil.
    public init?(json: JSONValue, timeZone: TimeZone = .current) {
        guard let type = json["type"]?.string else { return nil }
        func text(_ key: String) -> String? { json[key]?.string }
        func number(_ key: String) -> Double? { json[key]?.double }
        func whole(_ key: String) -> Int? { json[key]?.double.map { Int($0.rounded()) } }
        func day(_ key: String) -> String? { HealyxDate.isLocalDate(text(key)) ? text(key) : nil }
        func time(_ key: String) -> Date? {
            guard let raw = text(key) else { return nil }
            return HealyxDate.date(localDateTime: String(raw.prefix(16)), timeZone: timeZone)
        }

        switch type {
        case "log_sleep":
            guard let bed = time("bedtime"), let wake = time("wake_time"), wake > bed,
                  wake.timeIntervalSince(bed) <= 24 * 3600 else { return nil }
            self = .sleep(bedtime: bed, wakeTime: wake, minutesToFallAsleep: whole("minutes_to_fall_asleep"),
                          wakeUps: whole("wakeups"), minutesAwake: whole("minutes_awake"), quality: whole("quality_1_5"))
        case "log_stress":
            guard let rating = whole("rating_1_10"), (1...10).contains(rating) else { return nil }
            self = .stress(rating: rating)
        case "log_meal":
            guard let name = text("name") else { return nil }
            self = .meal(name: name, kcal: number("kcal"), proteinG: number("protein_g"), carbsG: number("carbs_g"),
                         fatG: number("fat_g"), fiberG: number("fiber_g"))
        case "log_water":
            guard let ml = number("ml"), ml > 0 else { return nil }
            self = .water(ml: ml)
        case "log_vital":
            guard let kind = text("kind").flatMap(VitalChatKind.init(rawValue:)), let value = number("value") else { return nil }
            self = .vital(kind: kind, value: value, value2: number("value2"))
        case "add_medication":
            guard let name = text("name") else { return nil }
            self = .addMedication(name: name, dose: text("dose"), frequency: text("frequency"), startedOn: day("started_on"))
        case "stop_medication":
            guard let name = text("name") else { return nil }
            self = .stopMedication(name: name)
        case "add_condition":
            guard let name = text("name") else { return nil }
            self = .addCondition(name: name, diagnosedOn: day("diagnosed_on"))
        case "add_lab":
            guard let name = text("name"), let raw = json["value"] else { return nil }
            let valueText: String
            switch raw {
            case .number(let n): valueText = jsNumberString(n)
            case .string(let s): valueText = s
            default: return nil
            }
            self = .addLab(name: name, value: raw.double, valueText: valueText, unit: text("unit"),
                           range: text("range"), date: day("date"))
        default:
            return nil
        }
    }

    /// A short, plain description for the "Saved" chip and spoken confirmation.
    public func summary(timeZone: TimeZone = .current) -> String {
        let clock = DateFormatter()
        clock.timeZone = timeZone
        clock.dateFormat = "h:mm a"
        func amount(_ value: Double) -> String { jsNumberString((value * 10).rounded() / 10) }
        switch self {
        case let .sleep(bed, wake, latency, _, awake, _):
            let minutes = max(Int(wake.timeIntervalSince(bed) / 60) - (latency ?? 0) - (awake ?? 0), 0)
            return "Sleep \(clock.string(from: bed)) to \(clock.string(from: wake)) (\(minutes / 60)h \(minutes % 60)m)"
        case let .stress(rating):
            return "Stress \(rating) of 10"
        case let .meal(name, kcal, _, _, _, _):
            return kcal.map { "\(name), \(Int($0.rounded())) kcal" } ?? name
        case let .water(ml):
            return "Water, \(Int(ml.rounded())) ml"
        case let .vital(kind, value, value2):
            switch kind {
            case .weight: return "Weight \(amount(value)) lb"
            case .bloodPressure: return "Blood pressure \(Int(value.rounded()))/\(value2.map { String(Int($0.rounded())) } ?? "?")"
            case .restingHR: return "Resting heart rate \(Int(value.rounded())) bpm"
            case .hrv: return "HRV \(Int(value.rounded())) ms"
            case .temperature: return "Temperature \(amount(value)) °F"
            }
        case let .addMedication(name, dose, _, _):
            return "Medication \(name)\(dose.map { " \($0)" } ?? "")"
        case let .stopMedication(name):
            return "Stopped \(name)"
        case let .addCondition(name, _):
            return "Condition \(name)"
        case let .addLab(name, _, valueText, unit, _, _):
            return "\(name) \(valueText)\(unit.map { " \($0)" } ?? "")"
        }
    }
}
