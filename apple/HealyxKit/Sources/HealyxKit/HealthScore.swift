import Foundation

// Port of the web app's lib/healthScore.ts and lib/clientHealth.ts.
//
// Healyx wellness indicator: a simplified, seven-factor adaptation inspired by
// AHA Life's Essential 8. Diet is not collected; treatment/history adjustments
// are not implemented. This is NOT a validated LE8 score or overall health rating.
// Available components are equally weighted. Missing values are excluded.
// Keep the bands identical to the web so both apps show the same number.

public enum ScoreKind: String, Sendable { case measured, behavior }

public struct ScoreComponent: Identifiable, Hashable, Sendable {
    public let key: String
    public let label: String
    public let kind: ScoreKind
    public let score: Int?
    public var id: String { key }
}

public struct FactorProvenance: Hashable, Sendable {
    public let date: String?
    public let source: String
    public let reason: String?
}

public struct HealthScore: Sendable {
    public let score: Int
    public let grade: String
    public let components: [ScoreComponent]
    public let present: [ScoreComponent]
    /// Available factors scoring under 60, weakest first.
    public let weakest: [ScoreComponent]
    public var measured: Int { present.count }
    public var total: Int { components.count }
    public var provenance: [String: FactorProvenance] = [:]
}

public struct HealthInputs: Sendable {
    public var bmi: Double?
    public var systolic: Double?
    public var diastolic: Double?
    public var hba1c: Double?
    public var fastingGlucose: Double?
    public var nonHDL: Double?
    public var sleepHours: Double?
    public var activityMinutes: Double?
    public var nicotine: String?

    public init(bmi: Double? = nil, systolic: Double? = nil, diastolic: Double? = nil, hba1c: Double? = nil,
                fastingGlucose: Double? = nil, nonHDL: Double? = nil, sleepHours: Double? = nil,
                activityMinutes: Double? = nil, nicotine: String? = nil) {
        self.bmi = bmi; self.systolic = systolic; self.diastolic = diastolic; self.hba1c = hba1c
        self.fastingGlucose = fastingGlucose; self.nonHDL = nonHDL; self.sleepHours = sleepHours
        self.activityMinutes = activityMinutes; self.nicotine = nicotine
    }
}

public enum HealthScoring {
    public static func bmi(_ bmi: Double?) -> Int? {
        guard let bmi, bmi.isFinite, bmi > 0 else { return nil }
        return bmi < 25 ? 100 : bmi < 30 ? 70 : bmi < 35 ? 30 : bmi < 40 ? 15 : 0
    }

    public static func bloodPressure(_ sys: Double?, _ dia: Double?) -> Int? {
        guard let sys, let dia, sys.isFinite, dia.isFinite, sys > 0, dia > 0, sys > dia else { return nil }
        // The more severe of either reading determines the band.
        if sys >= 160 || dia >= 100 { return 0 }
        if sys >= 140 || dia >= 90 { return 25 }
        if sys >= 130 || dia >= 80 { return 50 }
        if sys >= 120 { return 75 }
        return 100
    }

    public static func glucose(hba1c: Double?, fasting: Double?) -> Int? {
        if let a = hba1c, a.isFinite, a > 0, a <= 100 {
            if a < 5.7 { return 100 }
            if a < 6.5 { return 60 }
            if a < 7 { return 40 }
            if a < 8 { return 30 }
            if a < 9 { return 20 }
            if a < 10 { return 10 }
            return 0
        }
        if let f = fasting, f.isFinite, f > 0 {
            if f < 100 { return 100 }
            if f < 126 { return 60 }
            if f < 160 { return 40 }
            if f < 200 { return 20 }
            return 0
        }
        return nil
    }

    public static func lipids(nonHDL: Double?) -> Int? {
        guard let n = nonHDL, n.isFinite, n >= 0 else { return nil }
        return n < 130 ? 100 : n < 160 ? 60 : n < 190 ? 40 : n < 220 ? 20 : 0
    }

    public static func sleep(_ hrs: Double?) -> Int? {
        guard let h = hrs, h.isFinite, h >= 0, h <= 24 else { return nil }
        if h >= 7 && h < 9 { return 100 }
        if h >= 9 && h < 10 { return 90 }
        if h >= 6 && h < 7 { return 70 }
        if h >= 5 && h < 6 { return 40 }
        if h >= 4 && h < 5 { return 20 }
        return 0
    }

    public static func activity(minutesPerWeek m: Double?) -> Int? {
        guard let m, m.isFinite, m >= 0, m <= 7 * 24 * 60 else { return nil }
        if m >= 150 { return 100 }
        if m >= 120 { return 90 }
        if m >= 90 { return 80 }
        if m >= 60 { return 60 }
        if m >= 30 { return 40 }
        if m >= 1 { return 20 }
        return 0
    }

    /// Only explicit intake values are understood ("never", "former", "current").
    public static func nicotine(_ status: String?) -> Int? {
        guard let status else { return nil }
        switch status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "never": return 100
        case "former": return 75
        case "current": return 0
        default: return nil
        }
    }

    public static func compute(_ input: HealthInputs) -> HealthScore {
        let components = [
            ScoreComponent(key: "bp", label: "Blood pressure", kind: .measured, score: bloodPressure(input.systolic, input.diastolic)),
            ScoreComponent(key: "lipids", label: "Cholesterol", kind: .measured, score: lipids(nonHDL: input.nonHDL)),
            ScoreComponent(key: "glucose", label: "Blood sugar", kind: .measured, score: glucose(hba1c: input.hba1c, fasting: input.fastingGlucose)),
            ScoreComponent(key: "bmi", label: "Body weight", kind: .measured, score: bmi(input.bmi)),
            ScoreComponent(key: "activity", label: "Activity", kind: .behavior, score: activity(minutesPerWeek: input.activityMinutes)),
            ScoreComponent(key: "sleep", label: "Sleep", kind: .behavior, score: sleep(input.sleepHours)),
            ScoreComponent(key: "nicotine", label: "Nicotine", kind: .behavior, score: nicotine(input.nicotine)),
        ]
        let present = components.filter { $0.score != nil }
        let total = present.reduce(0) { $0 + ($1.score ?? 0) }
        let score = present.isEmpty ? 0 : max(0, min(100, Int((Double(total) / Double(present.count)).rounded())))
        let grade = present.isEmpty ? "Not enough data" : score >= 80 ? "Higher range" : score >= 50 ? "Middle range" : "Lower range"
        let weakest = present.filter { ($0.score ?? 0) < 60 }.sorted { ($0.score ?? 0) < ($1.score ?? 0) }
        return HealthScore(score: score, grade: grade, components: components, present: present, weakest: weakest)
    }
}

/// Port of `finiteObservation`: a finite number from a number or a strictly numeric string.
public func finiteObservation(_ value: String?) -> Double? {
    guard let raw = value?.trimmingCharacters(in: .whitespaces), !raw.isEmpty else { return nil }
    let pattern = #"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$"#
    guard raw.range(of: pattern, options: .regularExpression) != nil, let n = Double(raw), n.isFinite else { return nil }
    return n
}

public func finiteObservation(_ value: Double?) -> Double? {
    guard let value, value.isFinite else { return nil }
    return value
}

// MARK: - Lab eligibility (port of prepareScoringLabs)

public struct ScoringLabs: Sendable {
    public let nonHDL: Double?
    public let hba1c: Double?
    public let fastingGlucose: Double?
    public let provenance: [String: FactorProvenance]
}

public enum ScoringLabPreparer {
    static func labName(_ b: Biomarker) -> String {
        b.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            .split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    static func labUnit(_ b: Biomarker) -> String {
        (b.unit ?? "").lowercased().filter { !$0.isWhitespace }
    }

    struct Eligible { let value: Double?; let date: String?; let reason: String? }

    public static func prepare(_ rows: [Biomarker], now: Date = Date()) -> ScoringLabs {
        func named(_ names: [String]) -> [Biomarker] { rows.filter { names.contains(labName($0)) } }
        func latest(_ matches: [Biomarker]) -> Biomarker? {
            matches.filter { HealyxDate.observationDay($0.testDate, now: now) != nil }
                .sorted { ($0.testDate ?? "") > ($1.testDate ?? "") }
                .first
        }
        func eligible(_ matches: [Biomarker], unit: String) -> Eligible {
            guard let row = latest(matches) else {
                return Eligible(value: nil, date: nil, reason: "A valid dated observation is needed.")
            }
            let date = HealyxDate.observationDay(row.testDate, now: now)
            let sameDay = matches.filter { HealyxDate.observationDay($0.testDate, now: now) == date }
            let values = sameDay.map { finiteObservation($0.valueText) ?? finiteObservation($0.value) }
            let distinct = Set(values.map { $0.map { String($0) } ?? "nil" })
            if sameDay.contains(where: { labUnit($0) != unit }) || values.contains(where: { $0 == nil || $0! <= 0 }) || distinct.count != 1 {
                return Eligible(value: nil, date: date, reason: "Needs an unambiguous result in \(unit).")
            }
            return Eligible(value: values[0], date: date, reason: nil)
        }

        let total = eligible(named(["total cholesterol", "cholesterol, total"]), unit: "mg/dl")
        let hdl = eligible(named(["hdl", "hdl-c", "hdl cholesterol", "cholesterol, hdl"]), unit: "mg/dl")
        let a1c = eligible(named(["hba1c", "hb a1c", "a1c", "hemoglobin a1c", "haemoglobin a1c", "hemoglobin a1c (hba1c)"]), unit: "%")
        let fasting = eligible(named(["fasting glucose", "glucose, fasting", "fasting blood glucose", "glucose (fasting)"]), unit: "mg/dl")
        let validA1c = a1c.value.map { $0 <= 100 } ?? false
        var lipidsValid = false
        if let t = total.value, let h = hdl.value, total.date == hdl.date, t > h { lipidsValid = true }
        let glucose = validA1c ? a1c : fasting

        return ScoringLabs(
            nonHDL: lipidsValid ? total.value! - hdl.value! : nil,
            hba1c: validA1c ? a1c.value : nil,
            fastingGlucose: fasting.value,
            provenance: [
                "lipids": FactorProvenance(
                    date: lipidsValid ? total.date : nil, source: "Total cholesterol − HDL, mg/dL",
                    reason: lipidsValid ? nil : "Needs compatible total cholesterol and HDL from the same test date; unmatched or conflicting results are excluded."),
                "glucose": FactorProvenance(
                    date: glucose.value != nil ? glucose.date : nil,
                    source: validA1c ? "HbA1c, %" : "Explicitly fasting glucose, mg/dL",
                    reason: glucose.value != nil ? nil : "Needs a dated HbA1c in % or explicitly fasting glucose in mg/dL. Random glucose is excluded."),
            ]
        )
    }
}

// MARK: - Full load (port of loadHealthScore, minus the network calls)

public enum HealthScoreBuilder {
    /// Builds the score from already-fetched rows. `vitals` should be newest first
    /// (the web loads the latest 100); order is re-checked here anyway.
    public static func build(biomarkers: [Biomarker], vitals: [Vital], profile: Profile?,
                             intake: IntakeSnapshot?, now: Date = Date()) -> HealthScore {
        let labs = ScoringLabPreparer.prepare(biomarkers, now: now)
        let dated = vitals
            .filter { HealyxDate.observationDay($0.recordedAt, now: now) != nil }
            .sorted { ($0.recordedAt ?? "") > ($1.recordedAt ?? "") }
        // Both BP values must belong to the same dated observation, never separate visits.
        let bp = dated.first { $0.systolicBP != nil || $0.diastolicBP != nil }
        let bmiRow = dated.first { $0.bmi != nil }
        let height = profile?.heightInches.flatMap(finiteObservation)
        let weight = profile?.weightLbs.flatMap(finiteObservation)
        var bmi: Double?
        if let row = bmiRow {
            bmi = row.bmi
        } else if let h = height, let w = weight, h > 0, w > 0 {
            bmi = 703 * w / (h * h)
        }
        let intakeDay = HealyxDate.observationDay(intake?.completedAt, now: now)

        var result = HealthScoring.compute(HealthInputs(
            bmi: bmi,
            systolic: bp?.systolicBP, diastolic: bp?.diastolicBP,
            hba1c: labs.hba1c, fastingGlucose: labs.fastingGlucose, nonHDL: labs.nonHDL,
            sleepHours: intakeDay != nil ? intake?.sleepHours : nil,
            activityMinutes: nil, // Exercise days do not establish duration or intensity.
            nicotine: intakeDay != nil ? intake?.nicotine : nil
        ))
        func available(_ key: String) -> Bool { result.components.first { $0.key == key }?.score != nil }

        var provenance = labs.provenance
        provenance["bp"] = FactorProvenance(
            date: bp.flatMap { HealyxDate.observationDay($0.recordedAt, now: now) },
            source: "Paired systolic/diastolic vital, mmHg",
            reason: available("bp") ? nil : "Needs a valid dated blood-pressure pair from one observation.")
        provenance["bmi"] = FactorProvenance(
            date: bmiRow.flatMap { HealyxDate.observationDay($0.recordedAt, now: now) },
            source: bmiRow != nil ? "Recorded BMI" : "BMI derived from profile height (in) and weight (lb); profile measurements are undated",
            reason: available("bmi") ? nil : "Needs a valid BMI or positive profile height and weight.")
        provenance["sleep"] = FactorProvenance(
            date: intakeDay, source: "Self-reported sleep hours, completed intake",
            reason: available("sleep") ? nil : "Needs valid sleep hours from a dated completed intake.")
        provenance["nicotine"] = FactorProvenance(
            date: intakeDay, source: "Self-reported nicotine status, completed intake",
            reason: available("nicotine") ? nil : "Needs an explicit Never, Former, or Current response from a dated intake.")
        provenance["activity"] = FactorProvenance(
            date: nil, source: "Not measured",
            reason: "Exercise days alone cannot establish minutes or intensity.")
        result.provenance = provenance
        return result
    }
}
