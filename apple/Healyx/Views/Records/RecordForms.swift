import SwiftUI
import HealyxKit

/// Shared sheet chrome for record forms: title, Cancel, Save and an error line.
struct FormSheet<Content: View>: View {
    let title: String
    let saving: Bool
    let canSave: Bool
    let errorText: String?
    let save: () -> Void
    @ViewBuilder let content: Content

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                content
                if let errorText {
                    Section {
                        Text(errorText).font(.footnote).foregroundStyle(Theme.destructive)
                    }
                }
            }
            .formStyle(.grouped)
            .navigationTitle(title)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button("Save", action: save).disabled(!canSave)
                    }
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 460, idealWidth: 520, minHeight: 480, idealHeight: 620)
        #endif
    }
}

/// A labeled numeric text field with a unit.
struct NumberField: View {
    let label: String
    @Binding var text: String
    let unit: String

    var body: some View {
        HStack {
            Text(label)
            Spacer()
            TextField("0", text: $text)
                .multilineTextAlignment(.trailing)
                #if os(iOS)
                .keyboardType(.decimalPad)
                #endif
                .frame(maxWidth: 120)
            Text(unit).foregroundStyle(Theme.muted)
        }
    }
}

private func number(_ text: String) -> Double? {
    Double(text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."))
}

// MARK: - Vitals

struct AddVitalForm: View {
    @Environment(RecordsStore.self) private var records
    @Environment(\.dismiss) private var dismiss

    @State private var kind: VitalKind = .bloodPressure
    @State private var value = ""
    @State private var second = ""
    @State private var recordedAt = Date()
    @State private var saving = false
    @State private var errorText: String?

    private var parsed: (value: Double, second: Double?)? {
        guard let v = number(value), kind.range.contains(v) else { return nil }
        if kind == .bloodPressure {
            guard let d = number(second), (20...200).contains(d), v > d else { return nil }
            return (v, d)
        }
        return (v, nil)
    }

    var body: some View {
        FormSheet(title: "Add a reading", saving: saving, canSave: parsed != nil, errorText: errorText, save: save) {
            Section {
                Picker("Type", selection: $kind) {
                    ForEach(VitalKind.allCases) { Text($0.rawValue).tag($0) }
                }
                if kind == .bloodPressure {
                    NumberField(label: "Systolic (top)", text: $value, unit: "mmHg")
                    NumberField(label: "Diastolic (bottom)", text: $second, unit: "mmHg")
                } else {
                    NumberField(label: kind.rawValue, text: $value, unit: kind.unit)
                }
                DatePicker("Taken", selection: $recordedAt, in: ...Date())
            } footer: {
                Text(footer)
            }
        }
        .onChange(of: kind) {
            value = ""
            second = ""
        }
    }

    private var footer: String {
        switch kind {
        case .bloodPressure: return "Both numbers from the same reading. The overview uses the latest complete pair."
        case .weight: return "Saved in kilograms, as on the website."
        case .temperature: return "Saved in °C, as the database column expects."
        default: return "Typical range \(Int(kind.range.lowerBound))–\(Int(kind.range.upperBound)) \(kind.unit)."
        }
    }

    private func save() {
        guard let reading = parsed, let userID = records.currentUserID else { return }
        let input = kind.input(userID: userID, recordedAt: recordedAt, value: reading.value, secondValue: reading.second)
        saving = true
        errorText = nil
        Task {
            do {
                try await records.addVital(input)
                dismiss()
            } catch {
                errorText = error.localizedDescription
            }
            saving = false
        }
    }
}

// MARK: - Labs

struct AddLabForm: View {
    @Environment(RecordsStore.self) private var records
    @Environment(\.dismiss) private var dismiss

    private static let other = "Other…"

    @State private var choice = "LDL"
    @State private var customName = ""
    @State private var value = ""
    @State private var unit = "mg/dL"
    @State private var testDate = Date()
    @State private var flag = ""
    @State private var referenceRange = ""
    @State private var saving = false
    @State private var errorText: String?

    private var name: String {
        (choice == Self.other ? customName : choice).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSave: Bool {
        !name.isEmpty && number(value) != nil && !unit.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        FormSheet(title: "Add a lab result", saving: saving, canSave: canSave, errorText: errorText, save: save) {
            Section {
                Picker("Marker", selection: $choice) {
                    ForEach(commonBiomarkers, id: \.self) { Text($0).tag($0) }
                    Text(Self.other).tag(Self.other)
                }
                if choice == Self.other {
                    TextField("Marker name", text: $customName)
                }
                NumberField(label: "Result", text: $value, unit: "")
                TextField("Unit", text: $unit)
                DatePicker("Test date", selection: $testDate, in: ...Date(), displayedComponents: .date)
            }
            Section {
                Picker("Lab flag", selection: $flag) {
                    Text("Not shown on report").tag("")
                    Text("Normal").tag("normal")
                    Text("High").tag("high")
                    Text("Low").tag("low")
                }
                TextField("Reference range (optional)", text: $referenceRange)
            } footer: {
                Text("Copy the flag exactly as your report shows it. If there's no flag, Healyx keeps the status unknown instead of guessing.")
            }
        }
        .onChange(of: choice) {
            if let suggested = Self.defaultUnits[choice] { unit = suggested }
        }
    }

    private func save() {
        guard canSave, let result = number(value), let userID = records.currentUserID else { return }
        let input = BiomarkerInput(
            userID: userID, name: name, value: result,
            unit: unit.trimmingCharacters(in: .whitespaces),
            testDate: HealyxDate.localDateString(testDate),
            status: flag.isEmpty ? nil : flag,
            referenceRangeText: referenceRange.trimmingCharacters(in: .whitespaces).isEmpty ? nil : referenceRange
        )
        saving = true
        errorText = nil
        Task {
            do {
                try await records.addBiomarker(input)
                dismiss()
            } catch {
                errorText = error.localizedDescription
            }
            saving = false
        }
    }

    /// Common US reporting units, pre-filled when a marker is picked.
    static let defaultUnits: [String: String] = [
        "Total Cholesterol": "mg/dL", "LDL": "mg/dL", "HDL": "mg/dL", "Triglycerides": "mg/dL",
        "ApoB": "mg/dL", "Lp(a)": "nmol/L", "Glucose": "mg/dL", "Fasting Glucose": "mg/dL",
        "HbA1c": "%", "Insulin": "µIU/mL", "TSH": "mIU/L", "Free T4": "ng/dL", "Free T3": "pg/mL",
        "Vitamin D": "ng/mL", "B12": "pg/mL", "Folate": "ng/mL", "Iron": "µg/dL", "Ferritin": "ng/mL",
        "TIBC": "µg/dL", "Creatinine": "mg/dL", "BUN": "mg/dL", "eGFR": "mL/min/1.73m²",
        "ALT": "U/L", "AST": "U/L", "Alkaline Phosphatase": "U/L", "Total Bilirubin": "mg/dL",
        "Albumin": "g/dL", "Total Protein": "g/dL", "Sodium": "mmol/L", "Potassium": "mmol/L",
        "Chloride": "mmol/L", "CO2": "mmol/L", "Calcium": "mg/dL", "Magnesium": "mg/dL",
        "Phosphorus": "mg/dL", "WBC": "K/µL", "RBC": "M/µL", "Hemoglobin": "g/dL",
        "Hematocrit": "%", "MCV": "fL", "Platelets": "K/µL", "PSA": "ng/mL", "CRP": "mg/L",
        "Homocysteine": "µmol/L", "Uric Acid": "mg/dL",
    ]
}

// MARK: - Medications

struct MedicationForm: View {
    @Environment(RecordsStore.self) private var records
    @Environment(\.dismiss) private var dismiss

    let medication: Medication?

    @State private var name: String
    @State private var genericName: String
    @State private var dosage: String
    @State private var frequency: String
    @State private var route: String
    @State private var status: String
    @State private var hasStart: Bool
    @State private var startDate: Date
    @State private var hasEnd: Bool
    @State private var endDate: Date
    @State private var prescriber: String
    @State private var pharmacy: String
    @State private var notes: String
    @State private var saving = false
    @State private var errorText: String?
    @State private var confirmDelete = false

    init(medication: Medication?) {
        self.medication = medication
        _name = State(initialValue: medication?.name ?? "")
        _genericName = State(initialValue: medication?.genericName ?? "")
        _dosage = State(initialValue: medication?.dosage ?? "")
        _frequency = State(initialValue: medication?.frequency ?? "")
        _route = State(initialValue: medication?.route ?? "")
        _status = State(initialValue: medication?.status ?? "active")
        _hasStart = State(initialValue: HealyxDate.date(localDay: medication?.startDate) != nil)
        _startDate = State(initialValue: HealyxDate.date(localDay: medication?.startDate) ?? Date())
        _hasEnd = State(initialValue: HealyxDate.date(localDay: medication?.endDate) != nil)
        _endDate = State(initialValue: HealyxDate.date(localDay: medication?.endDate) ?? Date())
        _prescriber = State(initialValue: medication?.prescribingDoctor ?? "")
        _pharmacy = State(initialValue: medication?.pharmacy ?? "")
        _notes = State(initialValue: medication?.notes ?? "")
    }

    var body: some View {
        FormSheet(title: medication == nil ? "Add medication" : "Edit medication", saving: saving,
                  canSave: !name.trimmingCharacters(in: .whitespaces).isEmpty, errorText: errorText, save: save) {
            Section("Medication") {
                TextField("Name (e.g. Lisinopril)", text: $name)
                TextField("Generic name", text: $genericName)
                TextField("Dose (e.g. 10 mg)", text: $dosage)
                TextField("How often (e.g. once daily)", text: $frequency)
                Picker("Route", selection: $route) {
                    Text("Not set").tag("")
                    ForEach(["oral", "topical", "injection", "inhalation", "other"], id: \.self) { Text($0.capitalized).tag($0) }
                }
                Picker("Status", selection: $status) {
                    ForEach(["active", "paused", "discontinued"], id: \.self) { Text($0.capitalized).tag($0) }
                }
            }
            Section("Dates") {
                Toggle("Start date", isOn: $hasStart)
                if hasStart { DatePicker("Started", selection: $startDate, displayedComponents: .date) }
                Toggle("End date", isOn: $hasEnd)
                if hasEnd { DatePicker("Ended", selection: $endDate, displayedComponents: .date) }
            }
            Section("Care team") {
                TextField("Prescribing doctor", text: $prescriber)
                TextField("Pharmacy", text: $pharmacy)
            }
            Section("Notes") {
                TextField("Notes", text: $notes, axis: .vertical).lineLimit(2...6)
            }
            if let medication {
                Section {
                    Button("Delete medication", role: .destructive) { confirmDelete = true }
                }
                .confirmationDialog("Delete \(medication.name)?", isPresented: $confirmDelete, titleVisibility: .visible) {
                    Button("Delete", role: .destructive) {
                        Task {
                            if await records.delete(medication.id, from: .medications) { dismiss() }
                        }
                    }
                }
            }
        }
    }

    private func save() {
        let input = MedicationInput(
            name: name.trimmingCharacters(in: .whitespaces), genericName: genericName, dosage: dosage,
            frequency: frequency, route: route, status: status,
            startDate: hasStart ? HealyxDate.localDateString(startDate) : nil,
            endDate: hasEnd ? HealyxDate.localDateString(endDate) : nil,
            prescribingDoctor: prescriber, pharmacy: pharmacy, notes: notes
        )
        saving = true
        errorText = nil
        Task {
            do {
                try await records.saveMedication(input, id: medication?.id)
                dismiss()
            } catch {
                errorText = error.localizedDescription
            }
            saving = false
        }
    }
}

// MARK: - Conditions

struct ConditionForm: View {
    @Environment(RecordsStore.self) private var records
    @Environment(\.dismiss) private var dismiss

    let condition: Condition?

    @State private var name: String
    @State private var icd10: String
    @State private var status: String
    @State private var severity: String
    @State private var hasDiagnosed: Bool
    @State private var diagnosedDate: Date
    @State private var hasResolved: Bool
    @State private var resolvedDate: Date
    @State private var notes: String
    @State private var saving = false
    @State private var errorText: String?
    @State private var confirmDelete = false

    init(condition: Condition?) {
        self.condition = condition
        _name = State(initialValue: condition?.name ?? "")
        _icd10 = State(initialValue: condition?.icd10Code ?? "")
        _status = State(initialValue: condition?.status ?? "active")
        _severity = State(initialValue: condition?.severity ?? "")
        _hasDiagnosed = State(initialValue: HealyxDate.date(localDay: condition?.diagnosedDate) != nil)
        _diagnosedDate = State(initialValue: HealyxDate.date(localDay: condition?.diagnosedDate) ?? Date())
        _hasResolved = State(initialValue: HealyxDate.date(localDay: condition?.resolvedDate) != nil)
        _resolvedDate = State(initialValue: HealyxDate.date(localDay: condition?.resolvedDate) ?? Date())
        _notes = State(initialValue: condition?.notes ?? "")
    }

    var body: some View {
        FormSheet(title: condition == nil ? "Add condition" : "Edit condition", saving: saving,
                  canSave: !name.trimmingCharacters(in: .whitespaces).isEmpty, errorText: errorText, save: save) {
            Section("Condition") {
                TextField("Name (e.g. Hypertension)", text: $name)
                TextField("ICD-10 code (optional)", text: $icd10)
                Picker("Status", selection: $status) {
                    ForEach(["active", "resolved", "inactive"], id: \.self) { Text($0.capitalized).tag($0) }
                }
                Picker("Severity", selection: $severity) {
                    Text("Not set").tag("")
                    ForEach(["mild", "moderate", "severe"], id: \.self) { Text($0.capitalized).tag($0) }
                }
            }
            Section("Dates") {
                Toggle("Diagnosed date", isOn: $hasDiagnosed)
                if hasDiagnosed { DatePicker("Diagnosed", selection: $diagnosedDate, in: ...Date(), displayedComponents: .date) }
                Toggle("Resolved date", isOn: $hasResolved)
                if hasResolved { DatePicker("Resolved", selection: $resolvedDate, in: ...Date(), displayedComponents: .date) }
            }
            Section("Notes") {
                TextField("Notes", text: $notes, axis: .vertical).lineLimit(2...6)
            }
            if let condition {
                Section {
                    Button("Delete condition", role: .destructive) { confirmDelete = true }
                }
                .confirmationDialog("Delete \(condition.name)?", isPresented: $confirmDelete, titleVisibility: .visible) {
                    Button("Delete", role: .destructive) {
                        Task {
                            if await records.delete(condition.id, from: .conditions) { dismiss() }
                        }
                    }
                }
            }
        }
    }

    private func save() {
        let input = ConditionInput(
            name: name.trimmingCharacters(in: .whitespaces), icd10Code: icd10, status: status,
            diagnosedDate: hasDiagnosed ? HealyxDate.localDateString(diagnosedDate) : nil,
            resolvedDate: hasResolved ? HealyxDate.localDateString(resolvedDate) : nil,
            severity: severity, notes: notes
        )
        saving = true
        errorText = nil
        Task {
            do {
                try await records.saveCondition(input, id: condition?.id)
                dismiss()
            } catch {
                errorText = error.localizedDescription
            }
            saving = false
        }
    }
}
