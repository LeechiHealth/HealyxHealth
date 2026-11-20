import Foundation

// One Healyx biological age from routine bloodwork:
// 1. PhenoAge (Levine et al. 2018, Aging 10:573) when all nine PhenoAge labs are
//    on file. Coefficients at the full precision used by the BioAge package; the
//    final divisor 0.090165 follows the published correction (Liu et al. 2018).
// 2. Otherwise the Klemera-Doubal method (BiologicalAgeKDM.swift) on whatever of
//    13 NHANES markers are available, including systolic blood pressure.
// It's a research estimate, not a diagnosis.

/// One marker found in the person's labs or vitals.
public struct PhenoAgeMarker: Sendable, Hashable, Identifiable {
    public var id: String { key }
    public let key: String
    public let label: String
    /// The value as stored, with its unit.
    public let value: Double
    public let unit: String?
    public let testDate: String?
    /// The value converted to the formula's unit.
    public let converted: Double
}

public enum BiologicalAgeMethod: String, Sendable, Hashable {
    /// All nine PhenoAge labs (the most validated estimate).
    case phenoAge
    /// Klemera-Doubal with the markers on file.
    case kdm

    public var name: String { self == .phenoAge ? "PhenoAge" : "Klemera-Doubal method" }
}

public enum BiologicalAgeConfidence: String, Sendable, Hashable {
    case high, moderate, low

    public var label: String {
        switch self {
        case .high: return "High"
        case .moderate: return "Moderate"
        case .low: return "Low"
        }
    }
}

public struct BiologicalAgeResult: Sendable, Hashable {
    /// Biological age in years; nil when there isn't enough to estimate it.
    public var age: Double?
    /// Age in years on the date of the newest marker used.
    public var chronologicalAge: Double?
    /// Markers used by the method shown (or found so far, when there's no age).
    public var markers: [PhenoAgeMarker]
    /// PhenoAge labs that aren't on file (add these for the most validated estimate).
    public var missing: [String]
    /// The newest lab date among the markers used.
    public var labDate: String?
    /// True when the date of birth is missing.
    public var needsDateOfBirth: Bool
    /// True when KDM could run but needs sex (male or female) in the profile.
    public var needsSex: Bool = false
    public var method: BiologicalAgeMethod?
    public var confidence: BiologicalAgeConfidence?
    /// Typical spread (SD, years) of this estimate around calendar age in NHANES
    /// for the same marker set. PhenoAge: nil.
    public var typicalSpread: Double?

    /// Positive when biologically older than the calendar age.
    public var difference: Double? {
        guard let age, let chronologicalAge else { return nil }
        return age - chronologicalAge
    }
}

public enum BiologicalAge {
    /// The nine markers PhenoAge needs, with the names labs commonly use.
    static let markers: [(key: String, label: String, names: [String])] = [
        ("albumin", "Albumin", ["albumin"]),
        ("creatinine", "Creatinine", ["creatinine"]),
        ("glucose", "Glucose", ["glucose", "fasting glucose", "glucose, fasting", "glucose fasting"]),
        ("crp", "C-reactive protein", ["crp", "hs-crp", "hscrp", "c-reactive protein", "c reactive protein",
                                        "high sensitivity crp", "hs crp", "c-reactive protein, cardiac"]),
        ("lymphocytes", "Lymphocytes %", ["lymphocytes", "lymphocyte", "lymphs", "lymphocytes %", "lymphocyte %",
                                           "lymphocytes percent", "lymph %"]),
        ("mcv", "MCV", ["mcv", "mean corpuscular volume"]),
        ("rdw", "RDW", ["rdw", "rdw-cv", "red cell distribution width", "rdw cv"]),
        ("alp", "Alkaline phosphatase", ["alkaline phosphatase", "alp", "alk phos", "alkaline phosphatase, s"]),
        ("wbc", "White blood cells", ["wbc", "white blood cell count", "white blood cells", "wbc count", "leukocytes"]),
    ]

    /// Extra KDM markers that PhenoAge doesn't use.
    static let extraMarkers: [(key: String, label: String, names: [String])] = [
        ("hba1c", "Hemoglobin A1c", ["hemoglobin a1c", "hba1c", "a1c", "hgba1c", "hemoglobin a1c (hba1c)",
                                      "glycated hemoglobin", "glycohemoglobin", "hb a1c"]),
        ("bun", "Urea nitrogen (BUN)", ["bun", "urea nitrogen", "blood urea nitrogen", "urea nitrogen (bun)",
                                         "bun (urea nitrogen)", "urea nitrogen, blood"]),
        ("totchol", "Total cholesterol", ["total cholesterol", "cholesterol, total", "cholesterol", "cholesterol total"]),
    ]

    /// PhenoAge in years. Inputs in the formula's units: albumin g/L, creatinine
    /// umol/L, glucose mmol/L, CRP mg/dL, lymphocytes %, MCV fL, RDW %,
    /// alkaline phosphatase U/L, white blood cells 10^3/uL, age in years.
    public static func phenoAge(albuminGL: Double, creatinineUmolL: Double, glucoseMmolL: Double, crpMgDL: Double,
                                lymphocytePct: Double, mcvFL: Double, rdwPct: Double, alpUL: Double,
                                wbcK: Double, age: Double) -> Double? {
        guard crpMgDL > 0 else { return nil }
        let xb = -19.90667
            - 0.03359355 * albuminGL
            + 0.009506491 * creatinineUmolL
            + 0.1953192 * glucoseMmolL
            + 0.09536762 * log(crpMgDL)
            - 0.01199984 * lymphocytePct
            + 0.02676401 * mcvFL
            + 0.3306156 * rdwPct
            + 0.001868778 * alpUL
            + 0.05542406 * wbcK
            + 0.08035356 * age
        let mortality = 1 - exp(-1.51714 * exp(xb) / 0.007692696)
        guard mortality > 0, mortality < 1 else { return nil }
        let inner = -0.0055305 * log(1 - mortality)
        guard inner > 0 else { return nil }
        let result = 141.50225 + log(inner) / 0.090165
        return result.isFinite ? result : nil
    }

    /// PhenoAge when all nine labs are on file; otherwise KDM on what's available.
    /// - Parameters:
    ///   - sex: needed for KDM (it's trained separately for men and women).
    ///   - systolic: newest systolic blood pressure from vitals or Apple Health.
    public static func evaluate(biomarkers: [Biomarker], dateOfBirth: String?, sex: BiologicalSex? = nil,
                                systolic: SystolicReading? = nil, now: Date = Date()) -> BiologicalAgeResult {
        var found: [PhenoAgeMarker] = []
        var missing: [String] = []
        for marker in markers {
            if let hit = newest(marker, in: biomarkers) { found.append(hit) } else { missing.append(marker.label) }
        }

        let labDate = found.compactMap(\.testDate).max()
        let reference = labDate.flatMap { HealyxDate.utcDay(String($0.prefix(10))) } ?? now
        let chronological = dateOfBirth.flatMap { years(from: $0, to: reference) }

        var result = BiologicalAgeResult(age: nil, chronologicalAge: chronological, markers: found, missing: missing,
                                         labDate: labDate, needsDateOfBirth: chronological == nil)

        if missing.isEmpty, let chronological {
            func value(_ key: String) -> Double { found.first { $0.key == key }?.converted ?? 0 }
            if let age = phenoAge(albuminGL: value("albumin"), creatinineUmolL: value("creatinine"),
                                  glucoseMmolL: value("glucose"), crpMgDL: value("crp"),
                                  lymphocytePct: value("lymphocytes"), mcvFL: value("mcv"), rdwPct: value("rdw"),
                                  alpUL: value("alp"), wbcK: value("wbc"), age: chronological) {
                result.age = age
                result.method = .phenoAge
                result.confidence = .high
                return result
            }
        }

        // KDM fallback with every marker on file.
        let kdmMarkers = kdmInputs(found: found, biomarkers: biomarkers, systolic: systolic)
        guard kdmMarkers.count >= KDM.minimumMarkers else { return result }
        let kdmDate = kdmMarkers.compactMap(\.testDate).max()
        let kdmReference = kdmDate.flatMap { HealyxDate.utcDay(String($0.prefix(10))) } ?? now
        guard let ageNow = dateOfBirth.flatMap({ years(from: $0, to: kdmReference) }) else { return result }
        guard let sex else {
            result.needsSex = true
            return result
        }
        var values: [String: Double] = [:]
        for marker in kdmMarkers { values[marker.key] = marker.converted }
        guard let estimate = KDM.age(values: values, sex: sex, chronologicalAge: ageNow),
              estimate.spread <= KDM.maximumSpread else { return result }
        result.age = estimate.age
        result.chronologicalAge = ageNow
        result.markers = kdmMarkers
        result.labDate = kdmDate
        result.method = .kdm
        result.typicalSpread = estimate.spread
        var confidence: BiologicalAgeConfidence = estimate.spread <= 6 ? .moderate : .low
        if ageNow < 30 || ageNow > 75 { confidence = .low } // outside the NHANES training ages
        result.confidence = confidence
        return result
    }

    /// The markers KDM can use, keyed as KDMParameters.markerOrder, in KDM units.
    /// Only results within a year of the newest lab are combined.
    static func kdmInputs(found: [PhenoAgeMarker], biomarkers: [Biomarker], systolic: SystolicReading?) -> [PhenoAgeMarker] {
        var inputs: [PhenoAgeMarker] = []
        func add(_ marker: PhenoAgeMarker, key: String, converted: Double?) {
            guard let converted, converted.isFinite else { return }
            inputs.append(PhenoAgeMarker(key: key, label: KDM.labels[key] ?? marker.label, value: marker.value,
                                         unit: marker.unit, testDate: marker.testDate, converted: converted))
        }
        for marker in found {
            switch marker.key {
            case "albumin": add(marker, key: "albumin", converted: marker.converted / 10)        // g/L to g/dL
            case "creatinine": add(marker, key: "creat", converted: marker.converted / 88.42)   // umol/L to mg/dL
            case "glucose": add(marker, key: "glucose", converted: marker.converted * 18.016)   // mmol/L to mg/dL
            case "crp": add(marker, key: "lncrp", converted: log(1 + marker.converted))        // ln(1 + mg/dL), as in NHANES training
            case "alp": add(marker, key: "alp", converted: marker.converted)
            case "wbc": add(marker, key: "wbc", converted: marker.converted)
            case "lymphocytes": add(marker, key: "lymph", converted: marker.converted)
            case "mcv": add(marker, key: "mcv", converted: marker.converted)
            case "rdw": add(marker, key: "rdw", converted: marker.converted)
            default: break
            }
        }
        for marker in extraMarkers {
            if let hit = newest(marker, in: biomarkers) { add(hit, key: hit.key, converted: hit.converted) }
        }
        if let systolic, systolic.value > 60, systolic.value < 260 {
            inputs.append(PhenoAgeMarker(key: "sbp", label: KDM.labels["sbp"] ?? "Systolic blood pressure",
                                         value: systolic.value, unit: "mmHg", testDate: systolic.date,
                                         converted: systolic.value))
        }
        // Keep results within a year of the newest dated one.
        guard let newestDay = inputs.compactMap({ $0.testDate.flatMap { HealyxDate.utcDay(String($0.prefix(10))) } }).max()
        else { return inputs }
        return inputs.filter { marker in
            guard let day = marker.testDate.flatMap({ HealyxDate.utcDay(String($0.prefix(10))) }) else { return true }
            return newestDay.timeIntervalSince(day) <= 366 * 86_400
        }
    }

    static func newest(_ marker: (key: String, label: String, names: [String]), in biomarkers: [Biomarker]) -> PhenoAgeMarker? {
        let matches = biomarkers.filter { matchesMarker($0, key: marker.key, names: marker.names) && $0.value != nil }
        guard let newest = matches.max(by: { ($0.testDate ?? "") < ($1.testDate ?? "") }),
              let value = newest.value,
              let converted = convert(key: marker.key, value: value, unit: newest.unit) else { return nil }
        return PhenoAgeMarker(key: marker.key, label: marker.label, value: value, unit: newest.unit,
                              testDate: newest.testDate, converted: converted)
    }

    static func normalized(_ name: String) -> String {
        name.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func matchesMarker(_ biomarker: Biomarker, key: String, names: [String]) -> Bool {
        let name = normalized(biomarker.name)
        let unit = (biomarker.unit ?? "").lowercased()
        switch key {
        case "lymphocytes":
            // Only the percentage, not the absolute count.
            let isPercent = unit.contains("%") || name.contains("%") || name.contains("percent")
            let isAbsolute = name.contains("absolute") || name.contains("abs")
            return names.contains { name.hasPrefix($0) } && isPercent && !isAbsolute
        case "glucose":
            return names.contains(name) || (name.hasPrefix("glucose") && !name.contains("urine"))
        case "albumin":
            return name == "albumin" || name == "albumin, serum" || name == "serum albumin"
        case "creatinine":
            return name == "creatinine" || name == "creatinine, serum" || name == "serum creatinine"
        case "bun":
            return names.contains(name) && !name.contains("ratio") && !name.contains("creatinine")
        case "totchol":
            return names.contains(name) && !name.contains("hdl") && !name.contains("ldl") && !name.contains("ratio")
        default:
            return names.contains(name)
        }
    }

    /// Converts a lab value to the formula's unit, assuming common US units when
    /// the unit is missing. Returns nil when the unit isn't recognized.
    static func convert(key: String, value: Double, unit: String?) -> Double? {
        let u = (unit ?? "").lowercased().replacingOccurrences(of: " ", with: "")
        switch key {
        case "albumin":
            if u.isEmpty || u == "g/dl" { return value * 10 }
            if u == "g/l" { return value }
        case "creatinine":
            if u.isEmpty || u == "mg/dl" { return value * 88.42 }
            if u == "umol/l" || u == "µmol/l" || u == "μmol/l" { return value }
        case "glucose":
            if u.isEmpty || u == "mg/dl" { return value / 18.016 }
            if u == "mmol/l" { return value }
        case "crp":
            if u.isEmpty || u == "mg/l" { return max(value, 0.1) / 10 }
            if u == "mg/dl" { return max(value, 0.01) }
        case "lymphocytes", "rdw":
            return value
        case "mcv":
            if u.isEmpty || u == "fl" || u == "um3" || u == "µm3" { return value }
        case "alp":
            if u.isEmpty || u == "u/l" || u == "iu/l" { return value }
        case "wbc":
            if value > 500 { return value / 1000 } // cells/uL
            return value
        case "hba1c":
            if u.isEmpty || u == "%" || u.contains("%") { return value }
            if u == "mmol/mol" { return value / 10.929 + 2.15 } // IFCC to NGSP
        case "bun":
            if u.isEmpty || u == "mg/dl" { return value }
            if u == "mmol/l" { return value * 2.8 } // urea mmol/L to BUN mg/dL
        case "totchol":
            if u.isEmpty || u == "mg/dl" { return value }
            if u == "mmol/l" { return value * 38.67 }
        default:
            break
        }
        return nil
    }

    /// Whole and fractional years between a "yyyy-MM-dd" birth date and a date.
    static func years(from dateOfBirth: String, to date: Date) -> Double? {
        guard let birth = HealyxDate.utcDay(String(dateOfBirth.prefix(10))) else { return nil }
        let years = date.timeIntervalSince(birth) / (365.2425 * 86_400)
        return years > 0 && years < 130 ? years : nil
    }
}
