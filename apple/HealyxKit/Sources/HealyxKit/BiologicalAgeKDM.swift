import Foundation

// Klemera-Doubal method (KDM) biological age, used when the nine PhenoAge labs
// aren't all on file. Klemera & Doubal 2006; NHANES III parameters as trained by
// the BioAge package (Kwon & Belsky 2021, GeroScience). Works with any subset of
// at least four markers:
//
//   BA = (sum_j (x_j - q_j) * k_j / s_j^2 + CA / sBA2) / (sum_j (k_j / s_j)^2 + 1 / sBA2)
//
// where q, k, s come from regressing each marker on age, CA is calendar age, and
// sBA2 depends on the marker set (precomputed in KDMParameters).

public enum BiologicalSex: String, Sendable {
    case male, female

    /// Reads a profile gender value ("male", "Female", "M", "f", ...).
    public init?(profileValue: String?) {
        guard let value = profileValue?.lowercased().trimmingCharacters(in: .whitespaces), !value.isEmpty else { return nil }
        if value.hasPrefix("m") { self = .male } else if value.hasPrefix("f") || value.hasPrefix("w") { self = .female } else { return nil }
    }
}

/// A blood pressure reading for the KDM systolic marker.
public struct SystolicReading: Sendable, Hashable {
    public var value: Double
    /// "yyyy-MM-dd..." when known.
    public var date: String?

    public init(value: Double, date: String?) {
        self.value = value
        self.date = date
    }
}

public enum KDM {
    /// Markers in KDMParameters.markerOrder, with the lab names they match.
    static let labels: [String: String] = [
        "albumin": "Albumin", "creat": "Creatinine", "glucose": "Glucose", "hba1c": "Hemoglobin A1c",
        "lncrp": "C-reactive protein", "alp": "Alkaline phosphatase", "bun": "Urea nitrogen (BUN)",
        "totchol": "Total cholesterol", "wbc": "White blood cells", "lymph": "Lymphocytes %",
        "mcv": "MCV", "rdw": "RDW", "sbp": "Systolic blood pressure",
    ]

    /// Fewest markers KDM will use.
    public static let minimumMarkers = 4
    /// Above this typical spread (years), the estimate is too loose to show.
    public static let maximumSpread = 9.0

    private static let tables: [BiologicalSex: (sba2: [Float], spread: [Float])] = [
        .male: (floats(KDMParameters.maleSBA2), floats(KDMParameters.maleSpread)),
        .female: (floats(KDMParameters.femaleSBA2), floats(KDMParameters.femaleSpread)),
    ]

    private static func floats(_ base64: String) -> [Float] {
        guard let data = Data(base64Encoded: base64) else { return [] }
        return data.withUnsafeBytes { raw in
            (0..<(data.count / 4)).map { Float(bitPattern: UInt32(littleEndian: raw.loadUnaligned(fromByteOffset: $0 * 4, as: UInt32.self))) }
        }
    }

    static func parameters(_ sex: BiologicalSex) -> [String: (q: Double, k: Double, s: Double)] {
        sex == .male ? KDMParameters.male : KDMParameters.female
    }

    /// Variance term and typical spread for a marker set, or nil when that set
    /// wasn't trainable.
    static func setStats(keys: [String], sex: BiologicalSex) -> (sba2: Double, spread: Double)? {
        var mask = 0
        for key in keys {
            guard let index = KDMParameters.markerOrder.firstIndex(of: key) else { return nil }
            mask |= 1 << index
        }
        guard let table = tables[sex], mask < table.sba2.count else { return nil }
        let sba2 = Double(table.sba2[mask]), spread = Double(table.spread[mask])
        guard sba2.isFinite, sba2 > 0, spread.isFinite else { return nil }
        return (sba2, spread)
    }

    /// KDM age from markers already in KDM units (albumin g/dL, creatinine mg/dL,
    /// glucose mg/dL, HbA1c %, lncrp = ln(1 + CRP mg/dL), ALP U/L, BUN mg/dL,
    /// total cholesterol mg/dL, WBC 10^3/uL, lymphocytes %, MCV fL, RDW %, SBP mmHg).
    public static func age(values: [String: Double], sex: BiologicalSex, chronologicalAge: Double)
        -> (age: Double, spread: Double)? {
        let keys = KDMParameters.markerOrder.filter { values[$0] != nil }
        guard keys.count >= minimumMarkers, let stats = setStats(keys: keys, sex: sex) else { return nil }
        let params = parameters(sex)
        var numerator = chronologicalAge / stats.sba2
        var denominator = 1 / stats.sba2
        for key in keys {
            guard let p = params[key], let x = values[key], p.s > 0 else { return nil }
            numerator += (x - p.q) * p.k / (p.s * p.s)
            denominator += (p.k / p.s) * (p.k / p.s)
        }
        let result = numerator / denominator
        return result.isFinite ? (result, stats.spread) : nil
    }
}
