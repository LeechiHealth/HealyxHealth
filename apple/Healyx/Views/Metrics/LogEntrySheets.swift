import SwiftUI
import HealyxKit

// Quick manual logging: sleep, stress, resting heart rate, HRV, meals, water,
// weight and blood pressure. Logs feed the same scores as Apple Health.

private func parseNumber(_ text: String) -> Double? {
    Double(text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."))
}

private func intText(_ value: Int?) -> String { value.map(String.init) ?? "" }

extension ManualLogKind: Identifiable {
    public var id: String { rawValue }

    var symbol: String {
        switch self {
        case .sleep: return "moon.zzz.fill"
        case .restingHR: return "heart.fill"
        case .hrv: return "waveform.path.ecg"
        case .stress: return "brain.head.profile"
        case .meal: return "fork.knife"
        case .water: return "drop.fill"
        case .weight: return "scalemass.fill"
        case .bloodPressure: return "heart.text.square.fill"
        }
    }

    var color: Color {
        switch self {
        case .sleep: return Theme.indigo
        case .restingHR, .bloodPressure: return Theme.pink
        case .hrv: return Theme.green
        case .stress: return Theme.amber
        case .meal: return Theme.pink
        case .water: return Theme.primary
        case .weight: return Theme.teal
        }
    }

    var logTitle: String {
        switch self {
        case .sleep: return "Log sleep"
        case .restingHR: return "Log resting heart rate"
        case .hrv: return "Log HRV"
        case .stress: return "Log stress"
        case .meal: return "Log a meal"
        case .water: return "Log water"
        case .weight: return "Log weight"
        case .bloodPressure: return "Log blood pressure"
        }
    }
}

enum StressWords {
    static func word(_ rating: Int) -> String {
        switch rating {
        case ...2: return "Very calm"
        case 3...4: return "Calm"
        case 5...6: return "Some stress"
        case 7...8: return "Stressed"
        default: return "Very stressed"
        }
    }
}

enum ManualFormat {
    static func clock(_ date: Date) -> String { date.formatted(date: .omitted, time: .shortened) }

    static func day(_ date: Date) -> String {
        if Calendar.current.isDateInToday(date) { return "Today" }
        if Calendar.current.isDateInYesterday(date) { return "Yesterday" }
        return date.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
    }

    static func water(_ ml: Double, imperial: Bool) -> String {
        imperial ? "\(Int((ml / 29.5735).rounded())) oz" : "\(Int(ml.rounded())) ml"
    }

    static func summary(_ entry: ManualLogEntry, imperial: Bool) -> String {
        switch entry.kind {
        case .sleep:
            guard let log = ManualSleepLog(entry: entry) else { return "Sleep" }
            return "\(WellnessSummary.duration(log.asleepMinutes)) asleep · \(clock(log.bedtime)) to \(clock(log.wakeTime))"
        case .restingHR: return entry.value.map { "\(Int($0.rounded())) bpm" } ?? "–"
        case .hrv: return entry.value.map { "\(Int($0.rounded())) ms" } ?? "–"
        case .stress:
            let rating = Int((entry.value ?? 0).rounded())
            return "\(rating)/10 · \(StressWords.word(rating))"
        case .meal: return entry.value.map { "\(Int($0.rounded())) kcal" } ?? "Meal"
        case .water: return entry.value.map { water($0, imperial: imperial) } ?? "Water"
        case .weight: return entry.value.map { "\(Int($0.rounded()))" } ?? "Weight"
        case .bloodPressure:
            return "\(Int((entry.value ?? 0).rounded()))/\(Int((entry.value2 ?? 0).rounded())) mmHg"
        }
    }
}

// MARK: - Entry points

/// What a log sheet opens with.
struct LogSheetRequest: Identifiable {
    let kind: ManualLogKind
    var editing: ManualLogEntry?
    var id: String { kind.rawValue + (editing?.id ?? "") }
}

/// A "+" menu with the chosen kinds of logs.
struct LogMenu: View {
    var kinds: [ManualLogKind] = ManualLogKind.allCases
    var label: String? = nil
    var tint: Color = Theme.foreground

    @State private var request: LogSheetRequest?
    private var manual: ManualLogStore { ManualLogStore.shared }

    init(kinds: [ManualLogKind] = ManualLogKind.allCases, label: String? = nil, tint: Color = Theme.foreground) {
        self.kinds = kinds
        self.label = label
        self.tint = tint
    }

    var body: some View {
        Menu {
            ForEach(kinds) { kind in
                Button {
                    open(kind)
                } label: {
                    Label(kind == .sleep && manual.sleepLog(endingOn: Date()) != nil ? "Edit last night's sleep" : kind.logTitle,
                          systemImage: kind.symbol)
                }
            }
        } label: {
            if let label {
                Label(label, systemImage: "plus")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(tint)
            } else {
                Image(systemName: "plus")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(tint)
                    .frame(width: 34, height: 34)
                    .background(Theme.secondary.opacity(0.8), in: Circle())
                    .accessibilityLabel("Log")
            }
        }
        #if os(macOS)
        .menuStyle(.button)
        .buttonStyle(.borderless)
        .menuIndicator(.hidden)
        .fixedSize()
        #endif
        .sheet(item: $request) { request in
            LogEntrySheet(kind: request.kind, editing: request.editing)
        }
    }

    private func open(_ kind: ManualLogKind) {
        if kind == .sleep {
            request = LogSheetRequest(kind: .sleep, editing: manual.sleepLog(endingOn: Date()))
        } else {
            request = LogSheetRequest(kind: kind)
        }
    }
}

/// Recent manual logs for a detail screen, with a Log button and delete.
struct ManualLogSection: View {
    let kinds: [ManualLogKind]
    var title = "Your logs"
    var dark = false

    @AppStorage("units") private var units = "imperial"
    @State private var editing: LogSheetRequest?
    private var manual: ManualLogStore { ManualLogStore.shared }

    init(kinds: [ManualLogKind], title: String = "Your logs", dark: Bool = false) {
        self.kinds = kinds
        self.title = title
        self.dark = dark
    }

    private var recent: [ManualLogEntry] {
        let since = Calendar.current.date(byAdding: .day, value: -7, to: Date()) ?? Date()
        return Array(manual.entries(Set(kinds)).filter { $0.loggedAt >= since }.prefix(10))
    }

    private var text: Color { dark ? .white : Theme.foreground }
    private var subtle: Color { dark ? .white.opacity(0.65) : Theme.muted }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(title).font(.headline).foregroundStyle(text)
                Spacer()
                LogMenu(kinds: kinds, label: "Log", tint: dark ? .white : Theme.primary)
            }
            if recent.isEmpty {
                Text("No logs yet. Add your own numbers any time; they count toward your scores.")
                    .font(.footnote).foregroundStyle(subtle)
            } else {
                ForEach(recent) { entry in
                    row(entry)
                }
            }
            if let error = manual.errorMessage {
                Text(error).font(.footnote).foregroundStyle(Theme.destructive)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(dark ? AnyShapeStyle(Color.white.opacity(0.08)) : AnyShapeStyle(Theme.card),
                    in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .sheet(item: $editing) { request in
            LogEntrySheet(kind: request.kind, editing: request.editing)
        }
    }

    private func row(_ entry: ManualLogEntry) -> some View {
        HStack(spacing: 12) {
            IconBadge(symbol: entry.kind.symbol, color: entry.kind.color, size: 32)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(entry.title).font(.subheadline.weight(.semibold)).foregroundStyle(text)
                    Text("Logged")
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .foregroundStyle(entry.kind.color)
                        .background(entry.kind.color.opacity(0.15), in: Capsule())
                }
                Text(ManualFormat.summary(entry, imperial: units != "metric"))
                    .font(.caption).foregroundStyle(subtle).lineLimit(2)
                Text(ManualFormat.day(entry.loggedAt) + " · " + ManualFormat.clock(entry.loggedAt))
                    .font(.caption2).foregroundStyle(subtle)
            }
            Spacer(minLength: 8)
            if entry.kind == .sleep {
                Button {
                    editing = LogSheetRequest(kind: .sleep, editing: entry)
                } label: {
                    Image(systemName: "pencil").font(.footnote.weight(.semibold))
                }
                .buttonStyle(.plain)
                .foregroundStyle(subtle)
                .accessibilityLabel("Edit")
            }
            Button {
                Task { await manual.delete(entry) }
            } label: {
                Image(systemName: "trash").font(.footnote)
            }
            .buttonStyle(.plain)
            .foregroundStyle(subtle)
            .accessibilityLabel("Delete")
        }
        .contentShape(Rectangle())
        .contextMenu {
            if entry.kind == .sleep {
                Button("Edit") { editing = LogSheetRequest(kind: .sleep, editing: entry) }
            }
            Button("Delete", role: .destructive) { Task { await manual.delete(entry) } }
        }
    }
}

// MARK: - Sheets

struct LogEntrySheet: View {
    let kind: ManualLogKind
    var editing: ManualLogEntry?

    var body: some View {
        switch kind {
        case .sleep: SleepLogForm(existing: editing)
        case .stress: StressLogForm()
        case .restingHR: NumberLogForm(kind: .restingHR, label: "Resting heart rate", unit: "bpm", range: 25...150,
                                       footer: "Your lowest heart rate at rest, best measured right after waking.")
        case .hrv: NumberLogForm(kind: .hrv, label: "HRV (SDNN)", unit: "ms", range: 5...300,
                                 footer: "Heart rate variability from another device or app, in milliseconds.")
        case .meal: MealLogForm()
        case .water: WaterLogForm()
        case .weight: AddVitalForm(initialKind: .weight)
        case .bloodPressure: AddVitalForm(initialKind: .bloodPressure)
        }
    }
}

/// Saves through the store, then recomputes the scores.
private struct LogSaver {
    let wellness: WellnessStore

    func run(_ work: @escaping () async throws -> Void, onError: @escaping (String) -> Void,
             done: @escaping () -> Void) {
        Task { @MainActor in
            do {
                try await work()
                await wellness.refresh()
                done()
            } catch {
                onError("Couldn't save that. \(error.localizedDescription)")
            }
        }
    }
}

struct SleepLogForm: View {
    @Environment(WellnessStore.self) private var wellness
    @Environment(\.dismiss) private var dismiss

    let existing: ManualLogEntry?

    @State private var bedtime: Date
    @State private var wakeTime: Date
    @State private var latency: String
    @State private var wakeUps: Int
    @State private var minutesAwake: String
    @State private var deep: String
    @State private var rem: String
    @State private var core: String
    @State private var quality: Int
    @State private var notes: String
    @State private var showStages: Bool
    @State private var saving = false
    @State private var errorText: String?

    init(existing: ManualLogEntry?) {
        self.existing = existing
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let defaultBed = calendar.date(byAdding: .hour, value: -1, to: today) ?? today
        let defaultWake = calendar.date(byAdding: .hour, value: 7, to: today) ?? today
        let log = existing.flatMap(ManualSleepLog.init(entry:))
        _bedtime = State(initialValue: log?.bedtime ?? defaultBed)
        _wakeTime = State(initialValue: log?.wakeTime ?? min(defaultWake, Date()))
        _latency = State(initialValue: intText(log?.minutesToFallAsleep))
        _wakeUps = State(initialValue: log?.wakeUps ?? 0)
        _minutesAwake = State(initialValue: intText(log?.minutesAwake))
        _deep = State(initialValue: intText(log?.deepMinutes))
        _rem = State(initialValue: intText(log?.remMinutes))
        _core = State(initialValue: intText(log?.coreMinutes))
        _quality = State(initialValue: log?.quality ?? 0)
        _notes = State(initialValue: log?.notes ?? "")
        _showStages = State(initialValue: log?.hasStages ?? false)
    }

    private var earliest: Date { Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date() }

    private var log: ManualSleepLog? {
        guard wakeTime > bedtime, wakeTime.timeIntervalSince(bedtime) <= 18 * 3600 else { return nil }
        func int(_ text: String) -> Int? { parseNumber(text).map { Int($0.rounded()) } }
        return ManualSleepLog(bedtime: bedtime, wakeTime: wakeTime, minutesToFallAsleep: int(latency),
                              wakeUps: wakeUps > 0 ? wakeUps : nil, minutesAwake: int(minutesAwake),
                              deepMinutes: showStages ? int(deep) : nil, remMinutes: showStages ? int(rem) : nil,
                              coreMinutes: showStages ? int(core) : nil, quality: quality > 0 ? quality : nil,
                              notes: notes)
    }

    var body: some View {
        FormSheet(title: existing == nil ? "Log sleep" : "Edit sleep", saving: saving, canSave: log != nil,
                  errorText: errorText, save: save) {
            Section {
                DatePicker("Went to bed", selection: $bedtime, in: earliest...Date(),
                           displayedComponents: [.date, .hourAndMinute])
                DatePicker("Woke up", selection: $wakeTime, in: earliest...Date().addingTimeInterval(3600),
                           displayedComponents: [.date, .hourAndMinute])
            } footer: {
                if let log {
                    Text("\(WellnessSummary.duration(log.asleepMinutes)) asleep of \(WellnessSummary.duration(log.inBedMinutes)) in bed.")
                } else {
                    Text("Wake time must be after bedtime, within 18 hours.")
                }
            }
            Section {
                NumberField(label: "Time to fall asleep", text: $latency, unit: "min")
                Stepper(value: $wakeUps, in: 0...20) {
                    HStack {
                        Text("Times you woke up")
                        Spacer()
                        Text("\(wakeUps)").foregroundStyle(Theme.muted)
                    }
                }
                NumberField(label: "Minutes awake", text: $minutesAwake, unit: "min")
            } header: {
                Text("During the night")
            } footer: {
                Text("Leave minutes awake blank and Healyx assumes about \(ManualSleepLog.minutesPerWakeUp) minutes per wake-up.")
            }
            Section {
                Toggle("I know my sleep stages", isOn: $showStages)
                if showStages {
                    NumberField(label: "Deep", text: $deep, unit: "min")
                    NumberField(label: "REM", text: $rem, unit: "min")
                    NumberField(label: "Core (light)", text: $core, unit: "min")
                }
            } footer: {
                Text("From another tracker, if you have it. Stages make the sleep score and the stages chart more complete.")
            }
            Section("How did it feel?") {
                Picker("Quality", selection: $quality) {
                    Text("Skip").tag(0)
                    Text("Poor").tag(1)
                    Text("Fair").tag(2)
                    Text("OK").tag(3)
                    Text("Good").tag(4)
                    Text("Great").tag(5)
                }
                TextField("Notes (optional)", text: $notes, axis: .vertical)
                    .lineLimit(1...4)
            }
        }
    }

    private func save() {
        guard let log else { return }
        saving = true
        errorText = nil
        LogSaver(wellness: wellness).run({
            try await ManualLogStore.shared.save(sleep: log, replacing: existing?.id)
        }, onError: { message in
            errorText = message
            saving = false
        }, done: {
            saving = false
            dismiss()
        })
    }
}

struct StressLogForm: View {
    @Environment(WellnessStore.self) private var wellness
    @Environment(\.dismiss) private var dismiss

    @State private var rating: Double = 5
    @State private var loggedAt = Date()
    @State private var note = ""
    @State private var saving = false
    @State private var errorText: String?

    var body: some View {
        FormSheet(title: "Log stress", saving: saving, canSave: true, errorText: errorText, save: save) {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("\(Int(rating))").font(.system(size: 40, weight: .semibold, design: .rounded))
                        Text("/ 10").foregroundStyle(Theme.muted)
                        Spacer()
                        Text(StressWords.word(Int(rating))).font(.headline).foregroundStyle(Theme.amber)
                    }
                    Slider(value: $rating, in: 1...10, step: 1)
                    HStack {
                        Text("Very calm").font(.caption).foregroundStyle(Theme.muted)
                        Spacer()
                        Text("Very stressed").font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                .padding(.vertical, 4)
                DatePicker("When", selection: $loggedAt, in: ...Date())
                TextField("What's going on? (optional)", text: $note, axis: .vertical)
                    .lineLimit(1...3)
            } footer: {
                Text("Today's rating is blended into your stress score alongside your watch data.")
            }
        }
    }

    private func save() {
        saving = true
        errorText = nil
        var details: [String: JSONValue] = [:]
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { details["note"] = .string(trimmed) }
        let value = rating
        let date = loggedAt
        LogSaver(wellness: wellness).run({
            try await ManualLogStore.shared.add(kind: .stress, at: date, value: value, details: details)
        }, onError: { message in
            errorText = message
            saving = false
        }, done: {
            saving = false
            dismiss()
        })
    }
}

struct NumberLogForm: View {
    @Environment(WellnessStore.self) private var wellness
    @Environment(\.dismiss) private var dismiss

    let kind: ManualLogKind
    let label: String
    let unit: String
    let range: ClosedRange<Double>
    let footer: String

    @State private var value = ""
    @State private var loggedAt = Date()
    @State private var saving = false
    @State private var errorText: String?

    private var parsed: Double? {
        guard let v = parseNumber(value), range.contains(v) else { return nil }
        return v
    }

    var body: some View {
        FormSheet(title: kind.logTitle, saving: saving, canSave: parsed != nil, errorText: errorText, save: save) {
            Section {
                NumberField(label: label, text: $value, unit: unit)
                DatePicker("Measured", selection: $loggedAt, in: ...Date())
            } footer: {
                Text(footer)
            }
        }
    }

    private func save() {
        guard let parsed else { return }
        saving = true
        errorText = nil
        let kind = self.kind
        let date = loggedAt
        LogSaver(wellness: wellness).run({
            try await ManualLogStore.shared.add(kind: kind, at: date, value: parsed)
        }, onError: { message in
            errorText = message
            saving = false
        }, done: {
            saving = false
            dismiss()
        })
    }
}

struct MealLogForm: View {
    @Environment(WellnessStore.self) private var wellness
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var calories = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""
    @State private var fiber = ""
    @State private var loggedAt = Date()
    @State private var saving = false
    @State private var errorText: String?

    private var kcal: Double? {
        guard let v = parseNumber(calories), (1...5000).contains(v) else { return nil }
        return v
    }

    var body: some View {
        FormSheet(title: "Log a meal", saving: saving, canSave: kcal != nil, errorText: errorText, save: save) {
            Section {
                TextField("What did you eat?", text: $name)
                NumberField(label: "Calories", text: $calories, unit: "kcal")
                DatePicker("When", selection: $loggedAt, in: ...Date())
            }
            Section {
                NumberField(label: "Protein", text: $protein, unit: "g")
                NumberField(label: "Carbs", text: $carbs, unit: "g")
                NumberField(label: "Fat", text: $fat, unit: "g")
                NumberField(label: "Fiber", text: $fiber, unit: "g")
            } header: {
                Text("Optional")
            } footer: {
                Text("Add protein, carbs and fat to get a nutrition score for the day.")
            }
        }
    }

    private func save() {
        guard let kcal else { return }
        saving = true
        errorText = nil
        var details: [String: JSONValue] = [:]
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { details["name"] = .string(trimmed) }
        for (key, text) in [("protein", protein), ("carbs", carbs), ("fat", fat), ("fiber", fiber)] {
            if let v = parseNumber(text), v >= 0 { details[key] = .number(v) }
        }
        let date = loggedAt
        LogSaver(wellness: wellness).run({
            try await ManualLogStore.shared.add(kind: .meal, at: date, value: kcal, details: details)
        }, onError: { message in
            errorText = message
            saving = false
        }, done: {
            saving = false
            dismiss()
        })
    }
}

struct WaterLogForm: View {
    @Environment(WellnessStore.self) private var wellness
    @Environment(\.dismiss) private var dismiss
    @AppStorage("units") private var units = "imperial"

    @State private var custom = ""
    @State private var saving = false
    @State private var errorText: String?

    private var imperial: Bool { units != "metric" }

    private struct QuickAmount: Identifiable {
        let label: String
        let ml: Double
        var id: String { label }
    }

    /// Quick amounts in millilitres.
    private var quick: [QuickAmount] {
        imperial
            ? [QuickAmount(label: "+8 oz", ml: 236.6), QuickAmount(label: "+16 oz", ml: 473.2)]
            : [QuickAmount(label: "+250 ml", ml: 250), QuickAmount(label: "+500 ml", ml: 500)]
    }

    private var customML: Double? {
        guard let v = parseNumber(custom), v > 0 else { return nil }
        let ml = imperial ? v * 29.5735 : v
        return (1...5000).contains(ml) ? ml : nil
    }

    private var todayTotal: Double {
        ManualLogStore.shared.entries([.water])
            .filter { Calendar.current.isDateInToday($0.loggedAt) }
            .compactMap(\.value).reduce(0, +)
    }

    var body: some View {
        FormSheet(title: "Log water", saving: saving, canSave: customML != nil, errorText: errorText,
                  save: { if let customML { add(customML) } }) {
            Section {
                HStack(spacing: 12) {
                    ForEach(quick) { option in
                        Button(option.label) { add(option.ml) }
                            .buttonStyle(.borderedProminent)
                            .disabled(saving)
                    }
                }
                NumberField(label: "Other amount", text: $custom, unit: imperial ? "oz" : "ml")
            } footer: {
                Text("Logged today: \(ManualFormat.water(todayTotal, imperial: imperial)).")
            }
        }
    }

    private func add(_ ml: Double) {
        saving = true
        errorText = nil
        LogSaver(wellness: wellness).run({
            try await ManualLogStore.shared.add(kind: .water, at: Date(), value: ml)
        }, onError: { message in
            errorText = message
            saving = false
        }, done: {
            saving = false
            dismiss()
        })
    }
}
