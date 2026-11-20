import Foundation

// Biological age from routine bloodwork, using the PhenoAge formula from
// Levine et al. 2018 (Aging, "An epigenetic biomarker of aging for lifespan
// and healthspan"), with the corrected constants published in Liu et al. 2018
// (PLOS Medicine correction). It's a research estimate, not a diagnosis.

/// One PhenoAge marker found in the person's labs.
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

public struct BiologicalAgeResult: Sendable, Hashable {
    /// PhenoAge in years; nil when a marker or the date of birth is missing.
    public var age: Double?
    /// Age in years on the date of the newest marker used.
    public var chronologicalAge: Double?
    public var markers: [PhenoAgeMarker]
    /// Labels of the markers that aren't on file.
    public var missing: [String]
    /// The newest lab date among the markers used.
    public var labDate: String?
    /// True when the date of birth is missing.
    public var needsDateOfBirth: Bool

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

    /// PhenoAge in years. Inputs in the formula's units: albumin g/L, creatinine
    /// umol/L, glucose mmol/L, CRP mg/dL, lymphocytes %, MCV fL, RDW %,
    /// alkaline phosphatase U/L, white blood cells 10^3/uL, age in years.
    public static func phenoAge(albuminGL: Double, creatinineUmolL: Double, glucoseMmolL: Double, crpMgDL: Double,
                                lymphocytePct: Double, mcvFL: Double, rdwPct: Double, alpUL: Double,
                                wbcK: Double, age: Double) -> Double? {
        guard crpMgDL > 0 else { return nil }
        let xb = -19.9067
            - 0.0336 * albuminGL
            + 0.0095 * creatinineUmolL
            + 0.1953 * glucoseMmolL
            + 0.0954 * log(crpMgDL)
            - 0.0120 * lymphocytePct
            + 0.0268 * mcvFL
            + 0.3306 * rdwPct
            + 0.00188 * alpUL
            + 0.0554 * wbcK
            + 0.0804 * age
        let mortality = 1 - exp(-1.51714 * exp(xb) / 0.0076927)
        guard mortality > 0, mortality < 1 else { return nil }
        let inner = -0.00553 * log(1 - mortality)
        guard inner > 0 else { return nil }
        let result = 141.50225 + log(inner) / 0.090165
        return result.isFinite ? result : nil
    }

    /// Finds the newest value of each marker, converts units, and computes PhenoAge.
    public static func evaluate(biomarkers: [Biomarker], dateOfBirth: String?, now: Date = Date()) -> BiologicalAgeResult {
        var found: [PhenoAgeMarker] = []
        var missing: [String] = []
        for marker in markers {
            let matches = biomarkers.filter { matchesMarker($0, key: marker.key, names: marker.names) && $0.value != nil }
            let newest = matches.max { ($0.testDate ?? "") < ($1.testDate ?? "") }
            if let newest, let value = newest.value, let converted = convert(key: marker.key, value: value, unit: newest.unit) {
                found.append(PhenoAgeMarker(key: marker.key, label: marker.label, value: value, unit: newest.unit,
                                            testDate: newest.testDate, converted: converted))
            } else {
                missing.append(marker.label)
            }
        }

        let labDate = found.compactMap(\.testDate).max()
        let reference = labDate.flatMap { HealyxDate.utcDay(String($0.prefix(10))) } ?? now
        let chronological = dateOfBirth.flatMap { years(from: $0, to: reference) }

        var result = BiologicalAgeResult(age: nil, chronologicalAge: chronological, markers: found, missing: missing,
                                         labDate: labDate, needsDateOfBirth: chronological == nil)
        guard missing.isEmpty, let chronological else { return result }
        func value(_ key: String) -> Double { found.first { $0.key == key }?.converted ?? 0 }
        result.age = phenoAge(albuminGL: value("albumin"), creatinineUmolL: value("creatinine"),
                              glucoseMmolL: value("glucose"), crpMgDL: value("crp"),
                              lymphocytePct: value("lymphocytes"), mcvFL: value("mcv"), rdwPct: value("rdw"),
                              alpUL: value("alp"), wbcK: value("wbc"), age: chronological)
        return result
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
