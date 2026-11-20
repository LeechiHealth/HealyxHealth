import SwiftUI
import HealyxKit

/// Health Records: labs, vitals, medications and conditions, with add, edit and delete.
struct RecordsView: View {
    @Environment(RecordsStore.self) private var records

    enum Tab: String, CaseIterable, Identifiable {
        case labs = "Labs", vitals = "Vitals", medications = "Meds", conditions = "Conditions"
        var id: String { rawValue }
    }

    enum Editor: Identifiable {
        case vital, lab
        case medication(Medication?)
        case condition(Condition?)

        var id: String {
            switch self {
            case .vital: return "vital"
            case .lab: return "lab"
            case .medication(let m): return "med-\(m?.id ?? "new")"
            case .condition(let c): return "condition-\(c?.id ?? "new")"
            }
        }
    }

    @State private var tab: Tab = .labs
    @State private var editor: Editor?

    var body: some View {
        List {
            Section {
                Picker("Record type", selection: $tab) {
                    ForEach(Tab.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
            }

            if let error = records.errorMessage {
                Section {
                    ErrorBanner(message: error) { records.errorMessage = nil }
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                }
            }

            switch tab {
            case .labs: labsSection
            case .vitals: vitalsSection
            case .medications: medicationsSection
            case .conditions: conditionsSection
            }
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #else
        .listStyle(.inset)
        #endif
        .scrollContentBackground(.hidden)
        .healyxBackground()
        .refreshable { await records.reload() }
        .navigationTitle("Health Records")
        .navigationDestination(for: LabRoute.self) { route in
            LabHistoryView(name: route.name)
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    editor = newEditor
                } label: {
                    Label("Add", systemImage: "plus")
                }
            }
        }
        .sheet(item: $editor) { editor in
            switch editor {
            case .vital: AddVitalForm()
            case .lab: AddLabForm()
            case .medication(let medication): MedicationForm(medication: medication)
            case .condition(let condition): ConditionForm(condition: condition)
            }
        }
    }

    private var newEditor: Editor {
        switch tab {
        case .labs: return .lab
        case .vitals: return .vital
        case .medications: return .medication(nil)
        case .conditions: return .condition(nil)
        }
    }

    // MARK: Labs

    @ViewBuilder private var labsSection: some View {
        let brief = records.brief
        if brief.latest.isEmpty {
            emptyRow("No lab results yet", "Add your first result to start your record. You can also upload a lab report on the website.")
        } else {
            let grouped = Dictionary(grouping: brief.latest) { $0.record.category }
            ForEach(grouped.keys.sorted(), id: \.self) { category in
                Section(category) {
                    ForEach(grouped[category] ?? []) { row in
                        NavigationLink(value: LabRoute(name: row.record.name)) {
                            LabRow(row: row)
                        }
                    }
                }
            }
            if brief.undatedCount > 0 {
                Section {
                    Text("\(brief.undatedCount) result\(brief.undatedCount == 1 ? " has" : "s have") no valid test date, so \(brief.undatedCount == 1 ? "its" : "their") status is shown as unknown.")
                        .font(.footnote).foregroundStyle(Theme.muted)
                }
            }
        }
    }

    // MARK: Vitals

    @ViewBuilder private var vitalsSection: some View {
        if records.vitals.isEmpty {
            emptyRow("No vitals yet", "Add blood pressure, heart rate, weight, temperature or oxygen readings.")
        } else {
            Section("Recent readings") {
                ForEach(records.vitals) { vital in
                    VitalRow(vital: vital)
                        .deleteAction { await records.delete(vital.id, from: .vitals) }
                }
            }
        }
    }

    // MARK: Medications

    @ViewBuilder private var medicationsSection: some View {
        if records.medications.isEmpty {
            emptyRow("No medications yet", "Add prescriptions and over-the-counter medicines. The Medications agent uses this list for reminders and refills.")
        } else {
            Section("Medications") {
                ForEach(records.medications) { medication in
                    Button { editor = .medication(medication) } label: { MedicationRow(medication: medication) }
                        .buttonStyle(.plain)
                        .deleteAction { await records.delete(medication.id, from: .medications) }
                }
            }
        }
    }

    // MARK: Conditions

    @ViewBuilder private var conditionsSection: some View {
        if records.conditions.isEmpty {
            emptyRow("No conditions yet", "Add diagnoses you want Healyx to keep in mind.")
        } else {
            Section("Conditions") {
                ForEach(records.conditions) { condition in
                    Button { editor = .condition(condition) } label: { ConditionRow(condition: condition) }
                        .buttonStyle(.plain)
                        .deleteAction { await records.delete(condition.id, from: .conditions) }
                }
            }
        }
    }

    private func emptyRow(_ title: String, _ detail: String) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(.headline)
                Text(detail).font(.footnote).foregroundStyle(Theme.muted)
                Button("Add") { editor = newEditor }
                    .font(.footnote.weight(.semibold))
                    .padding(.top, 4)
            }
            .padding(.vertical, 6)
        }
    }
}

struct LabRoute: Hashable { let name: String }

// MARK: - Rows

private struct LabRow: View {
    let row: BriefRecord

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 3) {
                Text(row.record.name).font(.subheadline.weight(.semibold))
                Text(row.dateLabel).font(.caption).foregroundStyle(Theme.muted)
                if let change = row.change {
                    Text(change).font(.caption).foregroundStyle(Theme.muted)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(row.record.valueText ?? "–").font(.headline.monospacedDigit())
                    Text(row.record.unit ?? "").font(.caption).foregroundStyle(Theme.muted)
                }
                StatusChip(classification: row.classification, status: row.record.status)
            }
        }
        .padding(.vertical, 2)
    }
}

struct StatusChip: View {
    let classification: HealthClassification
    let status: String?

    var body: some View {
        switch classification {
        case .inRange: Chip(text: "In range", color: Theme.primary)
        case .flagged: Chip(text: (status ?? "Flagged").capitalized, color: Theme.warning)
        case .unknown: Chip(text: "Unknown", color: Theme.muted)
        }
    }
}

struct VitalRow: View {
    let vital: Vital

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(VitalFormat.summary(vital)).font(.subheadline.weight(.semibold))
            Text(VitalFormat.when(vital.recordedAt)).font(.caption).foregroundStyle(Theme.muted)
        }
        .padding(.vertical, 2)
    }
}

enum VitalFormat {
    /// The reading in US units.
    static func summary(_ v: Vital) -> String {
        var parts: [String] = []
        if let s = v.systolicBP, let d = v.diastolicBP { parts.append("\(jsNumberString(s))/\(jsNumberString(d)) mmHg") }
        if let hr = v.heartRate { parts.append("\(jsNumberString(hr)) bpm") }
        if let lbs = v.weightLbs { parts.append(String(format: "%.1f lb", lbs)) }
        if let f = v.temperatureFahrenheit { parts.append(String(format: "%.1f °F", f)) }
        if let o = v.oxygenSaturation { parts.append("SpO₂ \(jsNumberString(o))%") }
        if let b = v.bmi { parts.append(String(format: "BMI %.1f", b)) }
        return parts.isEmpty ? "Reading" : parts.joined(separator: " · ")
    }

    static func when(_ value: String?) -> String {
        guard let value, let date = HealyxDate.timestamp(value) else { return value ?? "No date" }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}

private struct MedicationRow: View {
    let medication: Medication

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(medication.name).font(.subheadline.weight(.semibold))
                let detail = [medication.dosage, medication.frequency].compactMap { $0 }.joined(separator: " · ")
                if !detail.isEmpty {
                    Text(detail).font(.caption).foregroundStyle(Theme.muted)
                }
            }
            Spacer()
            if !medication.isActive {
                Chip(text: (medication.status ?? "inactive").capitalized, color: Theme.muted)
            }
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.muted)
        }
        .contentShape(Rectangle())
        .padding(.vertical, 2)
    }
}

private struct ConditionRow: View {
    let condition: Condition

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(condition.name).font(.subheadline.weight(.semibold))
                let detail = [condition.severity?.capitalized, condition.icd10Code,
                              HealyxDate.displayDay(condition.diagnosedDate).map { "Since \($0)" }]
                    .compactMap { $0 }.joined(separator: " · ")
                if !detail.isEmpty {
                    Text(detail).font(.caption).foregroundStyle(Theme.muted)
                }
            }
            Spacer()
            Chip(text: (condition.status ?? "active").capitalized,
                 color: (condition.status ?? "active") == "active" ? Theme.primary : Theme.muted)
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.muted)
        }
        .contentShape(Rectangle())
        .padding(.vertical, 2)
    }
}

// MARK: - Lab history

struct LabHistoryView: View {
    @Environment(RecordsStore.self) private var records
    @Environment(AppRouter.self) private var router
    let name: String

    var body: some View {
        let history = records.history(forLab: name)
        List {
            Section {
                Button {
                    router.ask("Help me understand my \(name) results, what context is missing, and what questions I should explore next.")
                } label: {
                    Label("Ask the guide about \(name)", systemImage: "bubble.left.and.text.bubble.right")
                }
            }
            Section("All results") {
                ForEach(history) { result in
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(HealyxDate.displayDay(result.testDate) ?? "Date needs verification")
                                .font(.subheadline.weight(.medium))
                            if let range = result.referenceRangeText {
                                Text("Reference \(range)").font(.caption).foregroundStyle(Theme.muted)
                            }
                        }
                        Spacer()
                        Text("\(result.valueText ?? "–") \(result.unit ?? "")").font(.subheadline.monospacedDigit())
                        StatusChip(classification: HealthBriefBuilder.classification(result.status), status: result.status)
                    }
                    .deleteAction { await records.delete(result.id, from: .biomarkers) }
                }
            }
            Section {
                Text("Statuses are the flags saved with each result. A missing flag is shown as unknown, never as normal.")
                    .font(.footnote).foregroundStyle(Theme.muted)
            }
        }
        .scrollContentBackground(.hidden)
        .healyxBackground()
        .navigationTitle(name)
    }
}

// MARK: - Delete affordance (swipe on iPhone, right-click on Mac)

extension View {
    func deleteAction(_ action: @escaping () async -> Void) -> some View {
        modifier(DeleteAction(action: action))
    }
}

private struct DeleteAction: ViewModifier {
    let action: () async -> Void
    @State private var confirming = false

    func body(content: Content) -> some View {
        content
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button(role: .destructive) { confirming = true } label: { Label("Delete", systemImage: "trash") }
            }
            .contextMenu {
                Button(role: .destructive) { confirming = true } label: { Label("Delete", systemImage: "trash") }
            }
            .confirmationDialog("Delete this record?", isPresented: $confirming, titleVisibility: .visible) {
                Button("Delete", role: .destructive) { Task { await action() } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This removes it from your Healyx account on every device.")
            }
    }
}
