import Foundation

// Row models for the Healyx Supabase tables. Column names match the web app.
// Decoding is deliberately tolerant: a malformed value becomes nil instead of
// failing the whole list.

// MARK: - Vitals

public struct Vital: Decodable, Identifiable, Hashable, Sendable {
    public var id: String
    public var recordedAt: String?
    public var systolicBP: Double?
    public var diastolicBP: Double?
    public var heartRate: Double?
    public var weightKg: Double?
    public var temperatureCelsius: Double?
    public var oxygenSaturation: Double?
    public var bmi: Double?

    enum CodingKeys: String, CodingKey {
        case id, bmi
        case recordedAt = "recorded_at"
        case systolicBP = "systolic_bp"
        case diastolicBP = "diastolic_bp"
        case heartRate = "heart_rate"
        case weightKg = "weight_kg"
        case temperatureCelsius = "temperature_celsius"
        case oxygenSaturation = "oxygen_saturation"
    }

    public init(id: String, recordedAt: String?, systolicBP: Double? = nil, diastolicBP: Double? = nil,
                heartRate: Double? = nil, weightKg: Double? = nil, temperatureCelsius: Double? = nil,
                oxygenSaturation: Double? = nil, bmi: Double? = nil) {
        self.id = id; self.recordedAt = recordedAt; self.systolicBP = systolicBP; self.diastolicBP = diastolicBP
        self.heartRate = heartRate; self.weightKg = weightKg; self.temperatureCelsius = temperatureCelsius
        self.oxygenSaturation = oxygenSaturation; self.bmi = bmi
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.rowID(.id)
        recordedAt = c.lossyString(.recordedAt)
        systolicBP = c.lossyDouble(.systolicBP)
        diastolicBP = c.lossyDouble(.diastolicBP)
        heartRate = c.lossyDouble(.heartRate)
        weightKg = c.lossyDouble(.weightKg)
        temperatureCelsius = c.lossyDouble(.temperatureCelsius)
        oxygenSaturation = c.lossyDouble(.oxygenSaturation)
        bmi = c.lossyDouble(.bmi)
    }

    /// Weight in pounds, from the kg column.
    public var weightLbs: Double? { weightKg.map { $0 / 0.45359237 } }

    /// Temperature in °F. The web form labels its field °F but saves the number into
    /// `temperature_celsius` unconverted, so values in the human °F range (86–113) are
    /// read as °F as-is; values in the human °C range (25–46) are converted.
    public var temperatureFahrenheit: Double? {
        guard let t = temperatureCelsius else { return nil }
        if (25...46).contains(t) { return t * 9 / 5 + 32 }
        if (86...113).contains(t) { return t }
        return nil
    }

    /// The kind of measurement this row holds (each web entry fills one kind).
    public var summary: String {
        var parts: [String] = []
        if let s = systolicBP, let d = diastolicBP { parts.append("BP \(jsNumberString(s))/\(jsNumberString(d)) mmHg") }
        if let hr = heartRate { parts.append("HR \(jsNumberString(hr)) bpm") }
        if let w = weightKg { parts.append("Weight \(jsNumberString(w)) kg") }
        if let t = temperatureCelsius { parts.append("Temp \(String(format: "%.1f", t)) °C") }
        if let o = oxygenSaturation { parts.append("SpO₂ \(jsNumberString(o))%") }
        if let b = bmi { parts.append("BMI \(String(format: "%.1f", b))") }
        return parts.isEmpty ? "No values" : parts.joined(separator: " · ")
    }
}

/// A new vitals row. Only the fields for one measurement are set.
public struct VitalInput: Encodable, Sendable {
    public var userID: String
    public var recordedAt: String
    public var systolicBP: Int?
    public var diastolicBP: Int?
    public var heartRate: Int?
    public var weightKg: Double?
    public var temperatureCelsius: Double?
    public var oxygenSaturation: Int?

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case recordedAt = "recorded_at"
        case systolicBP = "systolic_bp"
        case diastolicBP = "diastolic_bp"
        case heartRate = "heart_rate"
        case weightKg = "weight_kg"
        case temperatureCelsius = "temperature_celsius"
        case oxygenSaturation = "oxygen_saturation"
    }

    public init(userID: String, recordedAt: Date) {
        self.userID = userID
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        self.recordedAt = formatter.string(from: recordedAt)
    }
}

public enum VitalKind: String, CaseIterable, Identifiable, Sendable {
    case bloodPressure = "Blood pressure"
    case heartRate = "Heart rate"
    case weight = "Weight"
    case temperature = "Temperature"
    case oxygen = "Oxygen saturation"

    public var id: String { rawValue }

    public var unit: String {
        switch self {
        case .bloodPressure: return "mmHg"
        case .heartRate: return "bpm"
        case .weight: return "lb"
        case .temperature: return "°F"
        case .oxygen: return "%"
        }
    }

    /// Plausible input bounds, to catch typos before they reach the record.
    public var range: ClosedRange<Double> {
        switch self {
        case .bloodPressure: return 30...300
        case .heartRate: return 20...250
        case .weight: return 20...1000
        case .temperature: return 86...113
        case .oxygen: return 50...100
        }
    }

    /// Builds the row. Weight is entered in pounds and temperature in °F, then stored
    /// in the kg and °C columns the schema names.
    public func input(userID: String, recordedAt: Date, value: Double, secondValue: Double? = nil) -> VitalInput {
        var row = VitalInput(userID: userID, recordedAt: recordedAt)
        switch self {
        case .bloodPressure:
            row.systolicBP = Int(value.rounded())
            row.diastolicBP = secondValue.map { Int($0.rounded()) }
        case .heartRate: row.heartRate = Int(value.rounded())
        case .weight: row.weightKg = (value * 0.45359237 * 10).rounded() / 10
        case .temperature: row.temperatureCelsius = ((value - 32) * 5 / 9 * 10).rounded() / 10
        case .oxygen: row.oxygenSaturation = Int(value.rounded())
        }
        return row
    }
}

// MARK: - Labs

public struct Biomarker: Decodable, Identifiable, Hashable, Sendable {
    public var id: String
    public var name: String
    /// The numeric value when the stored value is a finite number.
    public var value: Double?
    /// The stored value as text (JavaScript-style for numbers).
    public var valueText: String?
    public var unit: String?
    public var testDate: String?
    public var status: String?
    public var referenceRangeText: String?

    enum CodingKeys: String, CodingKey {
        case id, name, value, unit, status
        case testDate = "test_date"
        case referenceRangeText = "reference_range_text"
    }

    public init(id: String, name: String, value: Double?, unit: String?, testDate: String?,
                status: String? = nil, referenceRangeText: String? = nil) {
        self.id = id; self.name = name; self.value = value
        self.valueText = value.map(jsNumberString); self.unit = unit; self.testDate = testDate
        self.status = status; self.referenceRangeText = referenceRangeText
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.rowID(.id)
        name = c.lossyString(.name) ?? ""
        value = c.lossyDouble(.value)
        valueText = c.lossyString(.value)
        unit = c.lossyString(.unit)
        testDate = c.lossyString(.testDate)
        status = c.lossyString(.status)
        referenceRangeText = c.lossyString(.referenceRangeText)
    }

    /// Category used by the web Lab Results sidebar.
    public var category: String { Biomarker.category(for: name) }

    public static func category(for name: String) -> String {
        let n = name.lowercased()
        if n.contains("cholesterol") || n.contains("apob") || n.contains("apolipoprotein") { return "Heart health" }
        if n.contains("vitamin") || n.contains("b12") || n.contains("iron") { return "Nutrients" }
        if n.contains("tsh") || n.contains("thyroid") { return "Thyroid health" }
        if n.contains("glucose") || n.contains("a1c") || n.contains("hemoglobin") { return "Metabolic health" }
        if n.contains("ferritin") { return "Blood" }
        return "General"
    }
}

public struct BiomarkerInput: Encodable, Sendable {
    public var userID: String
    public var name: String
    public var value: Double
    public var unit: String
    public var testDate: String
    public var status: String?
    public var referenceRangeText: String?

    enum CodingKeys: String, CodingKey {
        case name, value, unit, status
        case userID = "user_id"
        case testDate = "test_date"
        case referenceRangeText = "reference_range_text"
    }

    public init(userID: String, name: String, value: Double, unit: String, testDate: String,
                status: String? = nil, referenceRangeText: String? = nil) {
        self.userID = userID; self.name = name; self.value = value; self.unit = unit
        self.testDate = testDate; self.status = status; self.referenceRangeText = referenceRangeText
    }
}

/// Common lab names offered in the add-lab form (same list as the web dialog).
public let commonBiomarkers: [String] = [
    "Total Cholesterol", "LDL", "HDL", "Triglycerides", "ApoB", "Lp(a)",
    "Glucose", "Fasting Glucose", "HbA1c", "Insulin", "TSH", "Free T4", "Free T3",
    "Vitamin D", "B12", "Folate", "Iron", "Ferritin", "TIBC",
    "Creatinine", "BUN", "eGFR", "ALT", "AST", "Alkaline Phosphatase",
    "Total Bilirubin", "Albumin", "Total Protein", "Sodium", "Potassium",
    "Chloride", "CO2", "Calcium", "Magnesium", "Phosphorus",
    "WBC", "RBC", "Hemoglobin", "Hematocrit", "MCV", "Platelets",
    "PSA", "CRP", "Homocysteine", "Uric Acid",
]

// MARK: - Conditions

public struct Condition: Decodable, Identifiable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var icd10Code: String?
    public var status: String?
    public var diagnosedDate: String?
    public var resolvedDate: String?
    public var severity: String?
    public var notes: String?

    enum CodingKeys: String, CodingKey {
        case id, name, status, severity, notes
        case icd10Code = "icd_10_code"
        case diagnosedDate = "diagnosed_date"
        case resolvedDate = "resolved_date"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.rowID(.id)
        name = c.lossyString(.name) ?? ""
        icd10Code = c.lossyString(.icd10Code)
        status = c.lossyString(.status)
        diagnosedDate = c.lossyString(.diagnosedDate)
        resolvedDate = c.lossyString(.resolvedDate)
        severity = c.lossyString(.severity)
        notes = c.lossyString(.notes)
    }
}

/// Insert or update payload. Empty optionals are sent as null so edits can clear fields.
public struct ConditionInput: Encodable, Sendable {
    public var userID: String?
    public var name: String
    public var icd10Code: String?
    public var status: String
    public var diagnosedDate: String?
    public var resolvedDate: String?
    public var severity: String?
    public var notes: String?

    enum CodingKeys: String, CodingKey {
        case name, status, severity, notes
        case userID = "user_id"
        case icd10Code = "icd_10_code"
        case diagnosedDate = "diagnosed_date"
        case resolvedDate = "resolved_date"
    }

    public init(userID: String? = nil, name: String, icd10Code: String? = nil, status: String = "active",
                diagnosedDate: String? = nil, resolvedDate: String? = nil, severity: String? = nil, notes: String? = nil) {
        self.userID = userID; self.name = name; self.icd10Code = icd10Code.nilIfBlank; self.status = status
        self.diagnosedDate = diagnosedDate; self.resolvedDate = resolvedDate
        self.severity = severity.nilIfBlank; self.notes = notes.nilIfBlank
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        if let userID { try c.encode(userID, forKey: .userID) }
        try c.encode(name, forKey: .name)
        try c.encode(status, forKey: .status)
        try c.encodeNullable(icd10Code, forKey: .icd10Code)
        try c.encodeNullable(diagnosedDate, forKey: .diagnosedDate)
        try c.encodeNullable(resolvedDate, forKey: .resolvedDate)
        try c.encodeNullable(severity, forKey: .severity)
        try c.encodeNullable(notes, forKey: .notes)
    }
}

// MARK: - Medications

public struct Medication: Decodable, Identifiable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var genericName: String?
    public var dosage: String?
    public var frequency: String?
    public var route: String?
    public var status: String?
    public var startDate: String?
    public var endDate: String?
    public var prescribingDoctor: String?
    public var pharmacy: String?
    public var notes: String?

    enum CodingKeys: String, CodingKey {
        case id, name, dosage, frequency, route, status, pharmacy, notes
        case genericName = "generic_name"
        case startDate = "start_date"
        case endDate = "end_date"
        case prescribingDoctor = "prescribing_doctor"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.rowID(.id)
        name = c.lossyString(.name) ?? ""
        genericName = c.lossyString(.genericName)
        dosage = c.lossyString(.dosage)
        frequency = c.lossyString(.frequency)
        route = c.lossyString(.route)
        status = c.lossyString(.status)
        startDate = c.lossyString(.startDate)
        endDate = c.lossyString(.endDate)
        prescribingDoctor = c.lossyString(.prescribingDoctor)
        pharmacy = c.lossyString(.pharmacy)
        notes = c.lossyString(.notes)
    }

    public var isActive: Bool { (status ?? "active").lowercased() == "active" }
}

public struct MedicationInput: Encodable, Sendable {
    public var userID: String?
    public var name: String
    public var genericName: String?
    public var dosage: String?
    public var frequency: String?
    public var route: String?
    public var status: String
    public var startDate: String?
    public var endDate: String?
    public var prescribingDoctor: String?
    public var pharmacy: String?
    public var notes: String?

    enum CodingKeys: String, CodingKey {
        case name, dosage, frequency, route, status, pharmacy, notes
        case userID = "user_id"
        case genericName = "generic_name"
        case startDate = "start_date"
        case endDate = "end_date"
        case prescribingDoctor = "prescribing_doctor"
    }

    public init(userID: String? = nil, name: String, genericName: String? = nil, dosage: String? = nil,
                frequency: String? = nil, route: String? = nil, status: String = "active",
                startDate: String? = nil, endDate: String? = nil, prescribingDoctor: String? = nil,
                pharmacy: String? = nil, notes: String? = nil) {
        self.userID = userID; self.name = name; self.genericName = genericName.nilIfBlank
        self.dosage = dosage.nilIfBlank; self.frequency = frequency.nilIfBlank; self.route = route.nilIfBlank
        self.status = status; self.startDate = startDate; self.endDate = endDate
        self.prescribingDoctor = prescribingDoctor.nilIfBlank; self.pharmacy = pharmacy.nilIfBlank
        self.notes = notes.nilIfBlank
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        if let userID { try c.encode(userID, forKey: .userID) }
        try c.encode(name, forKey: .name)
        try c.encode(status, forKey: .status)
        try c.encodeNullable(genericName, forKey: .genericName)
        try c.encodeNullable(dosage, forKey: .dosage)
        try c.encodeNullable(frequency, forKey: .frequency)
        try c.encodeNullable(route, forKey: .route)
        try c.encodeNullable(startDate, forKey: .startDate)
        try c.encodeNullable(endDate, forKey: .endDate)
        try c.encodeNullable(prescribingDoctor, forKey: .prescribingDoctor)
        try c.encodeNullable(pharmacy, forKey: .pharmacy)
        try c.encodeNullable(notes, forKey: .notes)
    }
}

// MARK: - Profile and intake

public struct Profile: Decodable, Hashable, Sendable {
    public var id: String
    public var fullName: String?
    public var dateOfBirth: String?
    public var gender: String?
    public var heightInches: Double?
    public var weightLbs: Double?
    public var bloodType: String?

    enum CodingKeys: String, CodingKey {
        case id, gender
        case fullName = "full_name"
        case dateOfBirth = "date_of_birth"
        case heightInches = "height_inches"
        case weightLbs = "weight_lbs"
        case bloodType = "blood_type"
    }

    public init(id: String, heightInches: Double? = nil, weightLbs: Double? = nil) {
        self.id = id; self.heightInches = heightInches; self.weightLbs = weightLbs
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.rowID(.id)
        fullName = c.lossyString(.fullName)
        dateOfBirth = c.lossyString(.dateOfBirth)
        gender = c.lossyString(.gender)
        heightInches = c.lossyDouble(.heightInches)
        weightLbs = c.lossyDouble(.weightLbs)
        bloodType = c.lossyString(.bloodType)
    }
}

/// The latest completed intake questionnaire (only the fields the score uses).
public struct IntakeSnapshot: Decodable, Hashable, Sendable {
    public var sleepHours: Double?
    public var nicotine: String?
    public var completedAt: String?

    enum CodingKeys: String, CodingKey {
        case nicotine
        case sleepHours = "sleep_hours"
        case completedAt = "completed_at"
    }

    public init(sleepHours: Double?, nicotine: String?, completedAt: String?) {
        self.sleepHours = sleepHours; self.nicotine = nicotine; self.completedAt = completedAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sleepHours = c.lossyDouble(.sleepHours)
        nicotine = c.lossyString(.nicotine)
        completedAt = c.lossyString(.completedAt)
    }
}

extension Optional where Wrapped == String {
    /// nil for nil, empty or whitespace-only strings; otherwise the trimmed string.
    public var nilIfBlank: String? {
        guard let trimmed = self?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        return trimmed
    }
}
