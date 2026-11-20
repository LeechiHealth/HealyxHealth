import Foundation

// Daily wellness scores (sleep, recovery, stress, nutrition) estimated from
// Apple Health data. This file has no HealthKit dependency: the app reads
// Health and hands plain values in, so the math is unit-tested on any platform.
// These are Healyx estimates for orientation, not medical measurements.

public enum SleepStage: Sendable, Hashable, CaseIterable {
    case inBed, awake, unspecified, core, deep, rem

    public var isAsleep: Bool {
        switch self {
        case .unspecified, .core, .deep, .rem: return true
        case .inBed, .awake: return false
        }
    }

    /// Short code used when syncing segments to the account.
    public var code: String {
        switch self {
        case .inBed: return "in_bed"
        case .awake: return "awake"
        case .unspecified: return "asleep"
        case .core: return "core"
        case .deep: return "deep"
        case .rem: return "rem"
        }
    }

    public init?(code: String) {
        guard let stage = SleepStage.allCases.first(where: { $0.code == code }) else { return nil }
        self = stage
    }

    public var label: String {
        switch self {
        case .inBed: return "In bed"
        case .awake: return "Awake"
        case .unspecified: return "Asleep"
        case .core: return "Core"
        case .deep: return "Deep"
        case .rem: return "REM"
        }
    }
}

public struct SleepSegment: Sendable, Hashable {
    public var start: Date
    public var end: Date
    public var stage: SleepStage

    public init(start: Date, end: Date, stage: SleepStage) {
        self.start = start
        self.end = end
        self.stage = stage
    }

    public var minutes: Double { max(end.timeIntervalSince(start), 0) / 60 }
}

public struct TimedValue: Sendable, Hashable {
    public var date: Date
    public var value: Double

    public init(date: Date, value: Double) {
        self.date = date
        self.value = value
    }
}

public struct TimeInterval2: Sendable, Hashable {
    public var start: Date
    public var end: Date

    public init(start: Date, end: Date) {
        self.start = start
        self.end = end
    }
}

/// What was logged to Apple Health today.
public struct NutritionTotals: Sendable, Hashable {
    public var energyKcal: Double?
    public var proteinG: Double?
    public var carbsG: Double?
    public var fatG: Double?
    public var fiberG: Double?
    public var waterML: Double?
    /// Energy burned today (Apple Watch or iPhone), for net energy.
    public var activeKcal: Double?
    public var basalKcal: Double?

    public init(energyKcal: Double? = nil, proteinG: Double? = nil, carbsG: Double? = nil,
                fatG: Double? = nil, fiberG: Double? = nil, waterML: Double? = nil,
                activeKcal: Double? = nil, basalKcal: Double? = nil) {
        self.energyKcal = energyKcal
        self.proteinG = proteinG
        self.carbsG = carbsG
        self.fatG = fatG
        self.fiberG = fiberG
        self.waterML = waterML
        self.activeKcal = activeKcal
        self.basalKcal = basalKcal
    }
}

public struct WellnessInput: Sendable {
    public var now: Date
    public var calendar: Calendar
    /// Sleep samples from the evening before through now.
    public var sleep: [SleepSegment]
    /// Heart rate variability (SDNN, ms) over the last ~31 days.
    public var hrv: [TimedValue]
    /// Resting heart rate (bpm) over the last ~31 days.
    public var restingHR: [TimedValue]
    /// Heart rate samples (bpm) from today.
    public var heartRate: [TimedValue]
    /// Today's workouts; heart rate inside them doesn't count toward stress.
    public var workouts: [TimeInterval2]
    public var nutrition: NutritionTotals

    public init(now: Date, calendar: Calendar = .current, sleep: [SleepSegment] = [], hrv: [TimedValue] = [],
                restingHR: [TimedValue] = [], heartRate: [TimedValue] = [], workouts: [TimeInterval2] = [],
                nutrition: NutritionTotals = NutritionTotals()) {
        self.now = now
        self.calendar = calendar
        self.sleep = sleep
        self.hrv = hrv
        self.restingHR = restingHR
        self.heartRate = heartRate
        self.workouts = workouts
        self.nutrition = nutrition
    }
}

public struct SleepResult: Sendable, Hashable {
    public var score: Int
    public var asleepMinutes: Int
    public var needMinutes: Int
    public var deepMinutes: Int?
    public var remMinutes: Int?
    public var coreMinutes: Int?
    public var wokeAt: Date?
    /// Minutes awake between falling asleep and waking up (staged data only).
    public var awakeMinutes: Int? = nil
    public var fellAsleepAt: Date? = nil
    /// When the person got into bed, if the source recorded it.
    public var inBedAt: Date? = nil

    /// Minutes from getting into bed to falling asleep, when both are known.
    public var minutesToFallAsleep: Int? {
        guard let inBedAt, let fellAsleepAt, fellAsleepAt > inBedAt else { return nil }
        let minutes = Int((fellAsleepAt.timeIntervalSince(inBedAt) / 60).rounded())
        return minutes <= 180 ? minutes : nil
    }

    public var metGoal: Bool { asleepMinutes >= needMinutes }
}

public struct RecoveryResult: Sendable, Hashable {
    public var score: Int
    public var hrvToday: Double?
    public var hrvBaseline: Double?
    public var restingToday: Double?
    public var restingBaseline: Double?
}

public struct StressResult: Sendable, Hashable {
    public var score: Int
    public var averageHR: Double?
    public var restingReference: Double?
    public var level: String {
        score < 34 ? "Low" : score < 67 ? "Moderate" : "High"
    }
}

public struct NutritionResult: Sendable, Hashable {
    /// nil when food was logged without a macro breakdown.
    public var score: Int?
    public var energyKcal: Double
    public var proteinPct: Int?
    public var carbsPct: Int?
    public var fatPct: Int?
    public var fiberG: Double?
    public var waterML: Double?
    public var activeKcal: Double? = nil
    public var basalKcal: Double? = nil

    /// Logged minus burned (negative is a deficit), when burn data exists.
    public var netKcal: Double? {
        guard activeKcal != nil || basalKcal != nil else { return nil }
        return energyKcal - (activeKcal ?? 0) - (basalKcal ?? 0)
    }
}

public struct WellnessSnapshot: Sendable, Hashable {
    public var sleep: SleepResult?
    public var recovery: RecoveryResult?
    public var stress: StressResult?
    public var nutrition: NutritionResult?
    public var computedAt: Date

    // What the detail charts need.
    /// Last night's sleep samples (asleep and awake), for the stages chart.
    public var sleepSegments: [SleepSegment] = []
    /// Average heart rate per hour today, outside workouts.
    public var heartRateHourly: [TimedValue] = []
    /// Estimated stress per hour today (0 to 100).
    public var stressHourly: [TimedValue] = []
    /// Daily HRV and resting heart rate means over the last 30 days.
    public var hrvDaily: [TimedValue] = []
    public var restingDaily: [TimedValue] = []
    /// Recovery estimate for each of the last 7 days, oldest first.
    public var recoveryHistory: [TimedValue] = []

    public var isEmpty: Bool { sleep == nil && recovery == nil && stress == nil && nutrition == nil }

    /// The middle half of today's hourly stress, as a personal "normal" band.
    public var stressRange: ClosedRange<Int>? {
        let values = stressHourly.map(\.value).sorted()
        guard values.count >= 4 else { return nil }
        let low = values[Int(Double(values.count - 1) * 0.25)]
        let high = values[Int(Double(values.count - 1) * 0.75)]
        return Int(low.rounded())...Int(high.rounded())
    }
}

public enum WellnessScoring {
    /// Sleep need used for the duration part of the sleep score.
    public static let sleepNeedMinutes = 8 * 60
    /// Days of history needed before a personal baseline counts.
    public static let minimumBaselineDays = 3

    public static func compute(_ input: WellnessInput) -> WellnessSnapshot {
        let sleep = sleepResult(input)
        let recovery = recoveryResult(input, sleep: sleep)
        let stress = stressResult(input, sleep: sleep)
        let nutrition = nutritionResult(input.nutrition)
        var snapshot = WellnessSnapshot(sleep: sleep, recovery: recovery, stress: stress, nutrition: nutrition,
                                        computedAt: input.now)
        snapshot.sleepSegments = input.sleep
            .filter { ($0.stage.isAsleep || $0.stage == .awake) && $0.end > $0.start }
            .sorted { $0.start < $1.start }
        let hourly = hourlyHeartRate(input, sleep: sleep)
        snapshot.heartRateHourly = hourly
        if let resting = restingReference(input), resting > 0 {
            snapshot.stressHourly = hourly.map { TimedValue(date: $0.date, value: clamp(($0.value - resting) / resting / 0.4 * 100)) }
        }
        snapshot.hrvDaily = dailyMeans(input.hrv, input: input, days: 30)
        snapshot.restingDaily = dailyMeans(input.restingHR, input: input, days: 30)
        snapshot.recoveryHistory = recoveryHistory(input, today: recovery)
        return snapshot
    }

    // MARK: Sleep

    static func sleepResult(_ input: WellnessInput) -> SleepResult? {
        let asleep = input.sleep.filter { $0.stage.isAsleep && $0.end > $0.start }
        let total = unionMinutes(asleep)
        guard total >= 60 else { return nil }

        let deep = unionMinutes(asleep.filter { $0.stage == .deep })
        let rem = unionMinutes(asleep.filter { $0.stage == .rem })
        let core = unionMinutes(asleep.filter { $0.stage == .core })
        let hasStages = deep + rem + core > 0

        let durationScore = min(total / Double(sleepNeedMinutes), 1) * 100
        var score = durationScore
        if hasStages {
            let staged = deep + rem + core
            let deepPart = min((deep / staged) / 0.13, 1)
            let remPart = min((rem / staged) / 0.20, 1)
            score = 0.7 * durationScore + 0.3 * ((deepPart + remPart) / 2 * 100)
        }
        let fellAsleep = asleep.map(\.start).min()
        let woke = asleep.map(\.end).max()
        var awake: Int?
        if hasStages, let fellAsleep, let woke {
            let inside = input.sleep.filter { $0.stage == .awake && $0.start >= fellAsleep && $0.end <= woke }
            awake = Int(unionMinutes(inside).rounded())
        }
        let inBed = input.sleep.filter { $0.stage == .inBed }.map(\.start).min()
        return SleepResult(
            score: clampScore(score),
            asleepMinutes: Int(total.rounded()),
            needMinutes: sleepNeedMinutes,
            deepMinutes: hasStages ? Int(deep.rounded()) : nil,
            remMinutes: hasStages ? Int(rem.rounded()) : nil,
            coreMinutes: hasStages ? Int(core.rounded()) : nil,
            wokeAt: woke,
            awakeMinutes: awake,
            fellAsleepAt: fellAsleep,
            inBedAt: inBed
        )
    }

    /// Minutes covered by the segments, counting overlaps once (Watch and iPhone can both record).
    static func unionMinutes(_ segments: [SleepSegment]) -> Double {
        let sorted = segments.sorted { $0.start < $1.start }
        var total: Double = 0
        var current: (start: Date, end: Date)?
        for segment in sorted {
            if let open = current, segment.start <= open.end {
                current = (open.start, max(open.end, segment.end))
            } else {
                if let open = current { total += open.end.timeIntervalSince(open.start) }
                current = (segment.start, segment.end)
            }
        }
        if let open = current { total += open.end.timeIntervalSince(open.start) }
        return total / 60
    }

    // MARK: Recovery

    static func recoveryResult(_ input: WellnessInput, sleep: SleepResult?) -> RecoveryResult? {
        let hrvToday = todayValue(input.hrv, input: input, average: true)
        let hrvBase = baseline(input.hrv, input: input)
        let rhrToday = todayValue(input.restingHR, input: input, average: false)
        let rhrBase = baseline(input.restingHR, input: input)

        guard let score = recoveryScore(hrv: hrvToday, hrvBase: hrvBase, resting: rhrToday, restingBase: rhrBase,
                                        sleepScore: sleep?.score) else { return nil }
        return RecoveryResult(score: score, hrvToday: hrvToday, hrvBaseline: hrvBase,
                              restingToday: rhrToday, restingBaseline: rhrBase)
    }

    static func recoveryScore(hrv: Double?, hrvBase: Double?, resting: Double?, restingBase: Double?,
                              sleepScore: Int?) -> Int? {
        var parts: [(score: Double, weight: Double)] = []
        if let today = hrv, let base = hrvBase, base > 0 {
            parts.append((clamp(50 + (today / base - 1) * 150), 0.5))
        }
        if let today = resting, let base = restingBase {
            parts.append((clamp(50 - (today - base) * 7), 0.3))
        }
        guard !parts.isEmpty else { return nil }
        if let sleepScore { parts.append((Double(sleepScore), 0.2)) }
        let weight = parts.reduce(0) { $0 + $1.weight }
        return clampScore(parts.reduce(0) { $0 + $1.score * $1.weight } / weight)
    }

    /// Recovery for each of the last 7 days (HRV and resting heart rate only for past
    /// days; today uses the full score), oldest first.
    static func recoveryHistory(_ input: WellnessInput, today: RecoveryResult?) -> [TimedValue] {
        let startOfToday = input.calendar.startOfDay(for: input.now)
        var history: [TimedValue] = []
        for offset in stride(from: 6, through: 1, by: -1) {
            guard let day = input.calendar.date(byAdding: .day, value: -offset, to: startOfToday),
                  let next = input.calendar.date(byAdding: .day, value: 1, to: day) else { continue }
            let hrvDay = mean(input.hrv.filter { $0.date >= day && $0.date < next }.map(\.value))
            let rhrDay = input.restingHR.filter { $0.date >= day && $0.date < next }.max { $0.date < $1.date }?.value
            let hrvBase = baseline(input.hrv, before: day, calendar: input.calendar)
            let rhrBase = baseline(input.restingHR, before: day, calendar: input.calendar)
            if let score = recoveryScore(hrv: hrvDay, hrvBase: hrvBase, resting: rhrDay, restingBase: rhrBase, sleepScore: nil) {
                history.append(TimedValue(date: day, value: Double(score)))
            }
        }
        if let today { history.append(TimedValue(date: startOfToday, value: Double(today.score))) }
        return history
    }

    /// Today's value: the average (HRV) or the latest (resting HR) from the last 24 hours.
    static func todayValue(_ values: [TimedValue], input: WellnessInput, average: Bool) -> Double? {
        let recent = values.filter { $0.date <= input.now && input.now.timeIntervalSince($0.date) <= 24 * 3600 }
        guard !recent.isEmpty else { return nil }
        if average { return recent.map(\.value).reduce(0, +) / Double(recent.count) }
        return recent.max { $0.date < $1.date }?.value
    }

    /// Mean of daily means over the 30 days before today.
    static func baseline(_ values: [TimedValue], input: WellnessInput) -> Double? {
        baseline(values, before: input.calendar.startOfDay(for: input.now), calendar: input.calendar)
    }

    /// Mean of daily means over the 30 days before `day`.
    static func baseline(_ values: [TimedValue], before day: Date, calendar: Calendar) -> Double? {
        guard let earliest = calendar.date(byAdding: .day, value: -30, to: day) else { return nil }
        var byDay: [Date: [Double]] = [:]
        for value in values where value.date < day && value.date >= earliest {
            byDay[calendar.startOfDay(for: value.date), default: []].append(value.value)
        }
        guard byDay.count >= minimumBaselineDays else { return nil }
        let dailyMeans = byDay.values.map { $0.reduce(0, +) / Double($0.count) }
        return dailyMeans.reduce(0, +) / Double(dailyMeans.count)
    }

    /// One mean per day over the last `days` days (including today), oldest first.
    static func dailyMeans(_ values: [TimedValue], input: WellnessInput, days: Int) -> [TimedValue] {
        let startOfToday = input.calendar.startOfDay(for: input.now)
        guard let earliest = input.calendar.date(byAdding: .day, value: -(days - 1), to: startOfToday) else { return [] }
        var byDay: [Date: [Double]] = [:]
        for value in values where value.date >= earliest && value.date <= input.now {
            byDay[input.calendar.startOfDay(for: value.date), default: []].append(value.value)
        }
        return byDay.keys.sorted().compactMap { day in
            mean(byDay[day] ?? []).map { TimedValue(date: day, value: $0) }
        }
    }

    // MARK: Stress

    /// Today's heart rate after waking, outside workouts.
    static func daytimeHeartRate(_ input: WellnessInput, sleep: SleepResult?) -> [TimedValue] {
        let startOfToday = input.calendar.startOfDay(for: input.now)
        let awakeFrom = max(sleep?.wokeAt ?? startOfToday.addingTimeInterval(6 * 3600), startOfToday)
        return input.heartRate.filter { sample in
            sample.date >= awakeFrom && sample.date <= input.now &&
                !input.workouts.contains { sample.date >= $0.start && sample.date <= $0.end }
        }
    }

    static func restingReference(_ input: WellnessInput) -> Double? {
        baseline(input.restingHR, input: input) ?? todayValue(input.restingHR, input: input, average: false)
    }

    static func hourlyHeartRate(_ input: WellnessInput, sleep: SleepResult?) -> [TimedValue] {
        var byHour: [Date: [Double]] = [:]
        for sample in daytimeHeartRate(input, sleep: sleep) {
            let parts = input.calendar.dateComponents([.year, .month, .day, .hour], from: sample.date)
            guard let hour = input.calendar.date(from: parts) else { continue }
            byHour[hour, default: []].append(sample.value)
        }
        return byHour.keys.sorted().compactMap { hour in
            mean(byHour[hour] ?? []).map { TimedValue(date: hour, value: $0) }
        }
    }

    static func stressResult(_ input: WellnessInput, sleep: SleepResult?) -> StressResult? {
        let daytime = daytimeHeartRate(input, sleep: sleep)
        let resting = restingReference(input)

        var parts: [(score: Double, weight: Double)] = []
        var average: Double?
        if daytime.count >= 10, let resting, resting > 0 {
            let mean = daytime.map(\.value).reduce(0, +) / Double(daytime.count)
            average = mean
            parts.append((clamp((mean - resting) / resting / 0.4 * 100), 0.6))
        }
        if let today = todayValue(input.hrv, input: input, average: true),
           let base = baseline(input.hrv, input: input), base > 0 {
            parts.append((clamp(50 - (today / base - 1) * 150), 0.4))
        }
        guard !parts.isEmpty else { return nil }
        let weight = parts.reduce(0) { $0 + $1.weight }
        let score = parts.reduce(0) { $0 + $1.score * $1.weight } / weight
        return StressResult(score: clampScore(score), averageHR: average, restingReference: resting)
    }

    // MARK: Nutrition

    /// Scores today's macro balance against the usual adult ranges (protein 10 to 35%,
    /// carbs 45 to 65%, fat 20 to 35% of calories) plus fiber toward 28 g.
    static func nutritionResult(_ totals: NutritionTotals) -> NutritionResult? {
        guard let energy = totals.energyKcal, energy > 0 else { return nil }
        let proteinKcal = (totals.proteinG ?? 0) * 4
        let carbsKcal = (totals.carbsG ?? 0) * 4
        let fatKcal = (totals.fatG ?? 0) * 9
        let macroKcal = proteinKcal + carbsKcal + fatKcal

        var result = NutritionResult(score: nil, energyKcal: energy, fiberG: totals.fiberG, waterML: totals.waterML,
                                     activeKcal: totals.activeKcal, basalKcal: totals.basalKcal)
        guard macroKcal > 0 else { return result }

        let protein = proteinKcal / macroKcal
        let carbs = carbsKcal / macroKcal
        let fat = fatKcal / macroKcal
        result.proteinPct = Int((protein * 100).rounded())
        result.carbsPct = Int((carbs * 100).rounded())
        result.fatPct = Int((fat * 100).rounded())

        var parts = [inRange(protein, 0.10, 0.35), inRange(carbs, 0.45, 0.65), inRange(fat, 0.20, 0.35)]
        if let fiber = totals.fiberG { parts.append(min(fiber / 28, 1)) }
        result.score = clampScore(parts.reduce(0, +) / Double(parts.count) * 100)
        return result
    }

    static func inRange(_ value: Double, _ low: Double, _ high: Double) -> Double {
        if value >= low && value <= high { return 1 }
        let distance = value < low ? low - value : value - high
        return 1 - min(distance / 0.15, 1)
    }

    // MARK: Helpers

    static func mean(_ values: [Double]) -> Double? {
        values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
    }

    static func clamp(_ value: Double) -> Double { min(max(value, 0), 100) }
    static func clampScore(_ value: Double) -> Int { Int(clamp(value).rounded()) }
}
