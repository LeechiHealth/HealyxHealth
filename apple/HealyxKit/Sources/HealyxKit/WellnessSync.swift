import Foundation

/// The numbers behind each wellness score, saved with the daily row so the Mac
/// (which has no Apple Health) can show the same card as the iPhone.
public struct WellnessDetails: Codable, Sendable, Hashable {
    public var sleepMinutes: Int?
    public var sleepNeedMinutes: Int?
    public var deepMinutes: Int?
    public var remMinutes: Int?
    public var coreMinutes: Int?
    public var hrvToday: Double?
    public var hrvBaseline: Double?
    public var restingToday: Double?
    public var restingBaseline: Double?
    public var averageHR: Double?
    public var restingReference: Double?
    public var energyKcal: Double?
    public var proteinPct: Int?
    public var carbsPct: Int?
    public var fatPct: Int?
    public var fiberG: Double?
    public var waterML: Double?
    public var awakeMinutes: Int?
    public var fellAsleepAt: String?
    public var inBedAt: String?
    public var activeKcal: Double?
    public var basalKcal: Double?
    // Chart data, so the Mac shows the same detail screens.
    public var sleepSegments: [SyncSegment]?
    public var heartRateHourly: [SyncPoint]?
    public var stressHourly: [SyncPoint]?
    public var hrvDaily: [SyncPoint]?
    public var restingDaily: [SyncPoint]?
    public var recoveryHistory: [SyncPoint]?

    enum CodingKeys: String, CodingKey {
        case sleepMinutes = "sleep_minutes"
        case sleepNeedMinutes = "sleep_need_minutes"
        case deepMinutes = "deep_minutes"
        case remMinutes = "rem_minutes"
        case coreMinutes = "core_minutes"
        case hrvToday = "hrv_today"
        case hrvBaseline = "hrv_baseline"
        case restingToday = "resting_today"
        case restingBaseline = "resting_baseline"
        case averageHR = "average_hr"
        case restingReference = "resting_reference"
        case energyKcal = "energy_kcal"
        case proteinPct = "protein_pct"
        case carbsPct = "carbs_pct"
        case fatPct = "fat_pct"
        case fiberG = "fiber_g"
        case waterML = "water_ml"
        case awakeMinutes = "awake_minutes"
        case fellAsleepAt = "fell_asleep_at"
        case inBedAt = "in_bed_at"
        case activeKcal = "active_kcal"
        case basalKcal = "basal_kcal"
        case sleepSegments = "sleep_segments"
        case heartRateHourly = "heart_rate_hourly"
        case stressHourly = "stress_hourly"
        case hrvDaily = "hrv_daily"
        case restingDaily = "resting_daily"
        case recoveryHistory = "recovery_history"
    }

    public init() {}
}

/// A dated value in the synced JSON.
public struct SyncPoint: Codable, Sendable, Hashable {
    public var t: String
    public var v: Double

    public init(_ value: TimedValue) {
        t = HealyxDate.isoTimestamp(value.date)
        v = value.value
    }

    public var timedValue: TimedValue? {
        HealyxDate.timestamp(t).map { TimedValue(date: $0, value: v) }
    }
}

/// A sleep stage segment in the synced JSON.
public struct SyncSegment: Codable, Sendable, Hashable {
    public var s: String
    public var e: String
    public var stage: String

    public init(_ segment: SleepSegment) {
        s = HealyxDate.isoTimestamp(segment.start)
        e = HealyxDate.isoTimestamp(segment.end)
        stage = segment.stage.code
    }

    public var segment: SleepSegment? {
        guard let start = HealyxDate.timestamp(s), let end = HealyxDate.timestamp(e),
              let kind = SleepStage(code: self.stage) else { return nil }
        return SleepSegment(start: start, end: end, stage: kind)
    }
}

/// One row of `public.wellness_daily`.
public struct WellnessDailyRow: Codable, Sendable, Hashable {
    /// Omitted when nil; the database fills it with the signed-in user.
    public var userID: String?
    /// Local calendar day, "yyyy-MM-dd".
    public var day: String
    public var sleepScore: Int?
    public var recoveryScore: Int?
    public var stressScore: Int?
    public var stressLevel: String?
    public var nutritionScore: Int?
    public var details: WellnessDetails
    public var computedAt: String?

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case day
        case sleepScore = "sleep_score"
        case recoveryScore = "recovery_score"
        case stressScore = "stress_score"
        case stressLevel = "stress_level"
        case nutritionScore = "nutrition_score"
        case details
        case computedAt = "computed_at"
    }

    public init(snapshot: WellnessSnapshot, userID: String?, timeZone: TimeZone = .current) {
        self.userID = userID
        day = HealyxDate.localDateString(snapshot.computedAt, timeZone: timeZone)
        sleepScore = snapshot.sleep?.score
        recoveryScore = snapshot.recovery?.score
        stressScore = snapshot.stress?.score
        stressLevel = snapshot.stress?.level
        nutritionScore = snapshot.nutrition?.score
        computedAt = HealyxDate.isoTimestamp(snapshot.computedAt)

        var details = WellnessDetails()
        if let sleep = snapshot.sleep {
            details.sleepMinutes = sleep.asleepMinutes
            details.sleepNeedMinutes = sleep.needMinutes
            details.deepMinutes = sleep.deepMinutes
            details.remMinutes = sleep.remMinutes
            details.coreMinutes = sleep.coreMinutes
            details.awakeMinutes = sleep.awakeMinutes
            details.fellAsleepAt = sleep.fellAsleepAt.map(HealyxDate.isoTimestamp)
            details.inBedAt = sleep.inBedAt.map(HealyxDate.isoTimestamp)
        }
        if let recovery = snapshot.recovery {
            details.hrvToday = recovery.hrvToday
            details.hrvBaseline = recovery.hrvBaseline
            details.restingToday = recovery.restingToday
            details.restingBaseline = recovery.restingBaseline
        }
        if let stress = snapshot.stress {
            details.averageHR = stress.averageHR
            details.restingReference = stress.restingReference
        }
        if let nutrition = snapshot.nutrition {
            details.energyKcal = nutrition.energyKcal
            details.proteinPct = nutrition.proteinPct
            details.carbsPct = nutrition.carbsPct
            details.fatPct = nutrition.fatPct
            details.fiberG = nutrition.fiberG
            details.waterML = nutrition.waterML
            details.activeKcal = nutrition.activeKcal
            details.basalKcal = nutrition.basalKcal
        }
        details.sleepSegments = snapshot.sleepSegments.map(SyncSegment.init)
        details.heartRateHourly = snapshot.heartRateHourly.map(SyncPoint.init)
        details.stressHourly = snapshot.stressHourly.map(SyncPoint.init)
        details.hrvDaily = snapshot.hrvDaily.map(SyncPoint.init)
        details.restingDaily = snapshot.restingDaily.map(SyncPoint.init)
        details.recoveryHistory = snapshot.recoveryHistory.map(SyncPoint.init)
        self.details = details
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userID = try c.decodeIfPresent(String.self, forKey: .userID)
        day = try c.decode(String.self, forKey: .day)
        sleepScore = try c.decodeIfPresent(Int.self, forKey: .sleepScore)
        recoveryScore = try c.decodeIfPresent(Int.self, forKey: .recoveryScore)
        stressScore = try c.decodeIfPresent(Int.self, forKey: .stressScore)
        stressLevel = try c.decodeIfPresent(String.self, forKey: .stressLevel)
        nutritionScore = try c.decodeIfPresent(Int.self, forKey: .nutritionScore)
        details = (try? c.decodeIfPresent(WellnessDetails.self, forKey: .details)) ?? WellnessDetails()
        computedAt = try c.decodeIfPresent(String.self, forKey: .computedAt)
    }

    /// Rebuilds the scores for display (on the Mac).
    public var snapshot: WellnessSnapshot {
        let d = details
        let sleep = sleepScore.map {
            SleepResult(score: $0, asleepMinutes: d.sleepMinutes ?? 0,
                        needMinutes: d.sleepNeedMinutes ?? WellnessScoring.sleepNeedMinutes,
                        deepMinutes: d.deepMinutes, remMinutes: d.remMinutes, coreMinutes: d.coreMinutes,
                        wokeAt: nil, awakeMinutes: d.awakeMinutes,
                        fellAsleepAt: d.fellAsleepAt.flatMap { HealyxDate.timestamp($0) },
                        inBedAt: d.inBedAt.flatMap { HealyxDate.timestamp($0) })
        }
        let recovery = recoveryScore.map {
            RecoveryResult(score: $0, hrvToday: d.hrvToday, hrvBaseline: d.hrvBaseline,
                           restingToday: d.restingToday, restingBaseline: d.restingBaseline)
        }
        let stress = stressScore.map {
            StressResult(score: $0, averageHR: d.averageHR, restingReference: d.restingReference)
        }
        let nutrition = d.energyKcal.map {
            NutritionResult(score: nutritionScore, energyKcal: $0, proteinPct: d.proteinPct, carbsPct: d.carbsPct,
                            fatPct: d.fatPct, fiberG: d.fiberG, waterML: d.waterML,
                            activeKcal: d.activeKcal, basalKcal: d.basalKcal)
        }
        let computed = computedAt.flatMap { HealyxDate.timestamp($0) } ?? Date()
        var snapshot = WellnessSnapshot(sleep: sleep, recovery: recovery, stress: stress, nutrition: nutrition, computedAt: computed)
        snapshot.sleepSegments = (d.sleepSegments ?? []).compactMap(\.segment)
        snapshot.heartRateHourly = (d.heartRateHourly ?? []).compactMap(\.timedValue)
        snapshot.stressHourly = (d.stressHourly ?? []).compactMap(\.timedValue)
        snapshot.hrvDaily = (d.hrvDaily ?? []).compactMap(\.timedValue)
        snapshot.restingDaily = (d.restingDaily ?? []).compactMap(\.timedValue)
        snapshot.recoveryHistory = (d.recoveryHistory ?? []).compactMap(\.timedValue)
        return snapshot
    }
}
