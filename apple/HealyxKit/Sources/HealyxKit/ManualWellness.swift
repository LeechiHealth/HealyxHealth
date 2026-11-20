import Foundation

// Manual logs (sleep, resting heart rate, HRV, stress, meals, water) that feed the
// same scores as Apple Health. Stored in the `wellness_manual` table. Pure Swift,
// no HealthKit, so it works on the Mac too and is unit-testable.

public enum ManualLogKind: String, CaseIterable, Sendable {
    case sleep
    case restingHR = "resting_hr"
    case hrv
    case stress
    case meal
    case water
    case weight
    case bloodPressure = "blood_pressure"

    public var label: String {
        switch self {
        case .sleep: return "Sleep"
        case .restingHR: return "Resting heart rate"
        case .hrv: return "HRV"
        case .stress: return "Stress"
        case .meal: return "Meal"
        case .water: return "Water"
        case .weight: return "Weight"
        case .bloodPressure: return "Blood pressure"
        }
    }
}

/// One row of `wellness_manual`.
public struct ManualLogEntry: Decodable, Identifiable, Hashable, Sendable {
    public var id: String
    public var kind: ManualLogKind
    public var loggedAt: Date
    public var value: Double?
    public var value2: Double?
    public var details: [String: JSONValue]

    enum CodingKeys: String, CodingKey { case id, kind, loggedAt = "logged_at", value, value2, details }

    public init(id: String, kind: ManualLogKind, loggedAt: Date, value: Double? = nil, value2: Double? = nil,
                details: [String: JSONValue] = [:]) {
        self.id = id
        self.kind = kind
        self.loggedAt = loggedAt
        self.value = value
        self.value2 = value2
        self.details = details
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        let rawKind = try c.decode(String.self, forKey: .kind)
        guard let kind = ManualLogKind(rawValue: rawKind) else {
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "Unknown kind \(rawKind)")
        }
        self.kind = kind
        let rawDate = try c.decode(String.self, forKey: .loggedAt)
        guard let date = HealyxDate.timestamp(rawDate) else {
            throw DecodingError.dataCorruptedError(forKey: .loggedAt, in: c, debugDescription: "Bad date")
        }
        loggedAt = date
        value = (try? c.decodeIfPresent(Double.self, forKey: .value)) ?? nil
        value2 = (try? c.decodeIfPresent(Double.self, forKey: .value2)) ?? nil
        details = ((try? c.decodeIfPresent([String: JSONValue].self, forKey: .details)) ?? nil) ?? [:]
    }

    /// Display name for a meal (or the kind's label).
    public var title: String {
        if kind == .meal, let name = details["name"]?.string { return name }
        return kind.label
    }
}

/// A row to insert into (or update in) `wellness_manual`.
public struct ManualLogInsert: Encodable, Sendable {
    public var userID: String
    public var kind: ManualLogKind
    public var loggedAt: Date
    public var value: Double?
    public var value2: Double?
    public var details: [String: JSONValue]

    enum CodingKeys: String, CodingKey { case userID = "user_id", kind, loggedAt = "logged_at", value, value2, details }

    public init(userID: String, kind: ManualLogKind, loggedAt: Date, value: Double? = nil, value2: Double? = nil,
                details: [String: JSONValue] = [:]) {
        self.userID = userID
        self.kind = kind
        self.loggedAt = loggedAt
        self.value = value
        self.value2 = value2
        self.details = details
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(userID, forKey: .userID)
        try c.encode(kind.rawValue, forKey: .kind)
        try c.encode(HealyxDate.isoTimestamp(loggedAt), forKey: .loggedAt)
        if let value { try c.encode(value, forKey: .value) } else { try c.encodeNil(forKey: .value) }
        if let value2 { try c.encode(value2, forKey: .value2) } else { try c.encodeNil(forKey: .value2) }
        try c.encode(details, forKey: .details)
    }
}

// MARK: - Sleep

/// A night of sleep entered by hand. Turned into sleep segments so the sleep score,
/// the stages chart and "time to fall asleep" all work without a Watch.
public struct ManualSleepLog: Sendable, Hashable {
    public var bedtime: Date
    public var wakeTime: Date
    public var minutesToFallAsleep: Int?
    public var wakeUps: Int?
    public var minutesAwake: Int?
    public var deepMinutes: Int?
    public var remMinutes: Int?
    public var coreMinutes: Int?
    /// 1 (poor) to 5 (great).
    public var quality: Int?
    public var notes: String?

    /// Minutes assumed per wake-up when the number of wake-ups is given without minutes.
    public static let minutesPerWakeUp = 5

    public init(bedtime: Date, wakeTime: Date, minutesToFallAsleep: Int? = nil, wakeUps: Int? = nil,
                minutesAwake: Int? = nil, deepMinutes: Int? = nil, remMinutes: Int? = nil, coreMinutes: Int? = nil,
                quality: Int? = nil, notes: String? = nil) {
        self.bedtime = bedtime
        self.wakeTime = wakeTime
        self.minutesToFallAsleep = minutesToFallAsleep
        self.wakeUps = wakeUps
        self.minutesAwake = minutesAwake
        self.deepMinutes = deepMinutes
        self.remMinutes = remMinutes
        self.coreMinutes = coreMinutes
        self.quality = quality
        self.notes = notes
    }

    public init?(entry: ManualLogEntry) {
        guard entry.kind == .sleep else { return nil }
        let d = entry.details
        let bed = d["bedtime"]?.string.flatMap(HealyxDate.timestamp) ?? entry.loggedAt
        let wake = d["wake"]?.string.flatMap(HealyxDate.timestamp)
            ?? entry.value2.map { Date(timeIntervalSince1970: $0) }
        guard let wake, wake > bed else { return nil }
        self.init(bedtime: bed, wakeTime: wake,
                  minutesToFallAsleep: d["latency"]?.int, wakeUps: d["wake_ups"]?.int,
                  minutesAwake: d["awake_min"]?.int, deepMinutes: d["deep"]?.int, remMinutes: d["rem"]?.int,
                  coreMinutes: d["core"]?.int, quality: d["quality"]?.int, notes: d["notes"]?.string)
    }

    /// Minutes between bedtime and wake time.
    public var inBedMinutes: Int { max(Int((wakeTime.timeIntervalSince(bedtime) / 60).rounded()), 0) }

    var latency: Int { min(max(minutesToFallAsleep ?? 0, 0), max(inBedMinutes - 1, 0)) }

    /// Awake minutes during the night (after falling asleep).
    public var effectiveAwakeMinutes: Int {
        let window = inBedMinutes - latency
        let given = minutesAwake ?? ((wakeUps ?? 0) * Self.minutesPerWakeUp)
        return min(max(given, 0), max(window - 1, 0))
    }

    public var asleepMinutes: Int { max(inBedMinutes - latency - effectiveAwakeMinutes, 0) }

    public var hasStages: Bool { (deepMinutes ?? 0) + (remMinutes ?? 0) + (coreMinutes ?? 0) > 0 }

    public var details: [String: JSONValue] {
        var d: [String: JSONValue] = [
            "bedtime": .string(HealyxDate.isoTimestamp(bedtime)),
            "wake": .string(HealyxDate.isoTimestamp(wakeTime)),
        ]
        func put(_ key: String, _ value: Int?) { if let value { d[key] = .number(Double(value)) } }
        put("latency", minutesToFallAsleep)
        put("wake_ups", wakeUps)
        put("awake_min", minutesAwake)
        put("deep", deepMinutes)
        put("rem", remMinutes)
        put("core", coreMinutes)
        put("quality", quality)
        if let notes, !notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { d["notes"] = .string(notes) }
        return d
    }

    public func insert(userID: String) -> ManualLogInsert {
        ManualLogInsert(userID: userID, kind: .sleep, loggedAt: bedtime, value: Double(asleepMinutes),
                        value2: wakeTime.timeIntervalSince1970, details: details)
    }

    /// In-bed, asleep (staged when stage minutes are given) and awake segments.
    /// Stage order within each roughly 90 minute cycle follows the usual pattern
    /// (more deep sleep early in the night, more REM later); the totals are what was entered.
    public func segments() -> [SleepSegment] {
        guard wakeTime > bedtime else { return [] }
        var result = [SleepSegment(start: bedtime, end: wakeTime, stage: .inBed)]
        let asleep = Double(asleepMinutes)
        guard asleep > 0 else { return result }

        // Ordered pieces of sleep (stage, minutes).
        var pieces: [(stage: SleepStage, minutes: Double)] = []
        if hasStages {
            var deep = Double(deepMinutes ?? 0), rem = Double(remMinutes ?? 0), core = Double(coreMinutes ?? 0)
            let given = deep + rem + core
            if given > asleep {
                let scale = asleep / given
                deep *= scale; rem *= scale; core *= scale
            } else {
                core += asleep - given
            }
            let cycles = max(1, Int((asleep / 90).rounded()))
            let deepWeights = (0..<cycles).map { Double(cycles - $0) }
            let remWeights = (0..<cycles).map { Double($0 + 1) }
            let deepSum = deepWeights.reduce(0, +), remSum = remWeights.reduce(0, +)
            for i in 0..<cycles {
                let c = core / Double(cycles)
                pieces.append((.core, c / 2))
                pieces.append((.deep, deep * deepWeights[i] / deepSum))
                pieces.append((.core, c / 2))
                pieces.append((.rem, rem * remWeights[i] / remSum))
            }
        } else {
            pieces.append((.unspecified, asleep))
        }
        pieces = pieces.filter { $0.minutes > 0.01 }

        // Wake-ups spread evenly through the night.
        let awakeTotal = Double(effectiveAwakeMinutes)
        let count = awakeTotal > 0 ? max(wakeUps ?? 1, 1) : 0
        var breaks: [Double] = []
        if count > 0 { breaks = (1...count).map { asleep * Double($0) / Double(count + 1) } }
        let chunk = count > 0 ? awakeTotal / Double(count) : 0

        var ordered: [(stage: SleepStage, minutes: Double)] = []
        var position: Double = 0
        var nextBreak = 0
        for piece in pieces {
            var remaining = piece.minutes
            while nextBreak < breaks.count, position + remaining > breaks[nextBreak] {
                let before = breaks[nextBreak] - position
                if before > 0.01 { ordered.append((piece.stage, before)) }
                ordered.append((.awake, chunk))
                position += max(before, 0)
                remaining -= max(before, 0)
                nextBreak += 1
            }
            if remaining > 0.01 { ordered.append((piece.stage, remaining)) }
            position += remaining
        }
        while nextBreak < breaks.count { ordered.append((.awake, chunk)); nextBreak += 1 }

        var cursor = bedtime.addingTimeInterval(Double(latency) * 60)
        for piece in ordered {
            let end = min(cursor.addingTimeInterval(piece.minutes * 60), wakeTime)
            if end > cursor { result.append(SleepSegment(start: cursor, end: end, stage: piece.stage)) }
            cursor = end
        }
        return result
    }
}

// MARK: - Merging into the scores

public enum ManualWellness {
    /// Stress ratings (1 to 10) become a 0 to 100 score; blended at this weight with the watch estimate.
    public static let manualStressWeight = 0.4

    /// The manual sleep log for last night: the latest one that ended after 6 p.m. yesterday.
    public static func lastNightSleep(_ entries: [ManualLogEntry], now: Date, calendar: Calendar) -> ManualSleepLog? {
        let windowStart = calendar.startOfDay(for: now).addingTimeInterval(-6 * 3600)
        return entries.compactMap(ManualSleepLog.init(entry:))
            .filter { $0.wakeTime > windowStart && $0.bedtime <= now }
            .max { $0.wakeTime < $1.wakeTime }
    }

    public static func todayStress(_ entries: [ManualLogEntry], now: Date, calendar: Calendar) -> ManualLogEntry? {
        entries.filter { $0.kind == .stress && $0.value != nil && calendar.isDate($0.loggedAt, inSameDayAs: now) && $0.loggedAt <= now }
            .max { $0.loggedAt < $1.loggedAt }
    }

    /// Adds manual logs to the Health input. Manual sleep is used only when Health has
    /// no sleep for last night.
    public static func merge(_ input: WellnessInput, entries: [ManualLogEntry]) -> WellnessInput {
        guard !entries.isEmpty else { return input }
        var out = input
        if !input.sleep.contains(where: { $0.stage.isAsleep }),
           let log = lastNightSleep(entries, now: input.now, calendar: input.calendar) {
            out.sleep += log.segments()
        }
        for entry in entries where entry.loggedAt <= input.now {
            guard let value = entry.value else { continue }
            switch entry.kind {
            case .restingHR: out.restingHR.append(TimedValue(date: entry.loggedAt, value: value))
            case .hrv: out.hrv.append(TimedValue(date: entry.loggedAt, value: value))
            default: break
            }
        }
        out.restingHR.sort { $0.date < $1.date }
        out.hrv.sort { $0.date < $1.date }

        let today = entries.filter { input.calendar.isDate($0.loggedAt, inSameDayAs: input.now) && $0.loggedAt <= input.now }
        let meals = today.filter { $0.kind == .meal }
        if !meals.isEmpty {
            func sum(_ key: String) -> Double? {
                let values = meals.compactMap { $0.details[key]?.double }
                return values.isEmpty ? nil : values.reduce(0, +)
            }
            let kcal = meals.compactMap(\.value).reduce(0, +)
            if kcal > 0 { out.nutrition.energyKcal = (out.nutrition.energyKcal ?? 0) + kcal }
            if let p = sum("protein") { out.nutrition.proteinG = (out.nutrition.proteinG ?? 0) + p }
            if let c = sum("carbs") { out.nutrition.carbsG = (out.nutrition.carbsG ?? 0) + c }
            if let f = sum("fat") { out.nutrition.fatG = (out.nutrition.fatG ?? 0) + f }
            if let f = sum("fiber") { out.nutrition.fiberG = (out.nutrition.fiberG ?? 0) + f }
        }
        let water = today.filter { $0.kind == .water }.compactMap(\.value).reduce(0, +)
        if water > 0 { out.nutrition.waterML = (out.nutrition.waterML ?? 0) + water }
        return out
    }

    /// Blends today's stress rating into the stress score (or uses it alone).
    public static func applyStress(_ snapshot: WellnessSnapshot, entries: [ManualLogEntry], now: Date,
                                   calendar: Calendar) -> WellnessSnapshot {
        guard let entry = todayStress(entries, now: now, calendar: calendar), let rating = entry.value else { return snapshot }
        let clamped = min(max(rating, 1), 10)
        let manualScore = (clamped - 1) / 9 * 100
        var out = snapshot
        if var stress = snapshot.stress {
            let blended = Double(stress.score) * (1 - manualStressWeight) + manualScore * manualStressWeight
            stress.score = WellnessScoring.clampScore(blended)
            stress.manualRating = Int(clamped.rounded())
            out.stress = stress
        } else {
            out.stress = StressResult(score: WellnessScoring.clampScore(manualScore), averageHR: nil,
                                      restingReference: nil, manualRating: Int(clamped.rounded()))
        }
        return out
    }

    /// Scores from manual logs alone, used to fill what a synced or Health snapshot is missing
    /// (the Mac, or an iPhone without Apple Health connected).
    public static func fill(_ base: WellnessSnapshot?, entries: [ManualLogEntry], now: Date,
                            calendar: Calendar) -> WellnessSnapshot? {
        guard !entries.isEmpty else { return base }
        let manualInput = merge(WellnessInput(now: now, calendar: calendar), entries: entries)
        let manual = applyStress(WellnessScoring.compute(manualInput), entries: entries, now: now, calendar: calendar)
        guard var out = base else { return manual.isEmpty ? nil : manual }
        if out.sleep == nil, manual.sleep != nil {
            out.sleep = manual.sleep
            out.sleepSegments = manual.sleepSegments
        }
        if out.recovery == nil { out.recovery = manual.recovery }
        if out.nutrition == nil { out.nutrition = manual.nutrition }
        out = applyStress(out, entries: entries, now: now, calendar: calendar)
        return out
    }
}
