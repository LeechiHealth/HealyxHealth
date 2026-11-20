import SwiftUI
import HealyxKit

/// One agent task, rendered by kind. Port of components/agents/task-card.tsx,
/// with "Add to Calendar" going straight into the person's calendar.
struct TaskCardView: View {
    @Environment(AgentsStore.self) private var agents
    let task: AgentTask

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    if let agent = task.agent { AgentAvatar(agent: agent, size: 26) }
                    Text(task.kind.label).eyebrow()
                    Spacer()
                    if task.status != .todo {
                        Chip(text: task.status.label, color: task.status == .done ? Theme.primary : Theme.warning)
                    }
                }
                Text(task.title).font(.headline)
                if !task.summaryLine.isEmpty {
                    Text(task.summaryLine).font(.footnote).foregroundStyle(Theme.muted)
                }
            }

            switch task.kind {
            case .appointment: AppointmentBody(task: task)
            case .medReminder: MedReminderBody(task: task)
            case .refillRequest: RefillBody(task: task)
            case .researchBrief: ResearchBody(task: task)
            case .shoppingList: ShoppingBody(task: task)
            case .unknown: Text("Open this task on the website to see its details.").font(.footnote).foregroundStyle(Theme.muted)
            }

            if task.local {
                Text("This task couldn't be saved to your account and will disappear when you close the app.")
                    .font(.caption).foregroundStyle(Theme.warning)
            }

            Divider()
            actions
        }
        .card()
    }

    @ViewBuilder private var actions: some View {
        if task.isOpen {
            HStack(spacing: 10) {
                Button(task.kind.doneLabel) { update(.done) }
                    .buttonStyle(.borderedProminent)
                if task.status != .waiting {
                    Button("Waiting on reply") { update(.waiting) }
                        .buttonStyle(.bordered)
                }
                Spacer()
                Button("Dismiss", role: .destructive) { update(.dismissed) }
                    .buttonStyle(.borderless)
            }
            .font(.footnote.weight(.semibold))
        } else {
            HStack {
                Text("Marked \(task.status.label.lowercased()).").font(.footnote).foregroundStyle(Theme.muted)
                Spacer()
                Button("Reopen") { update(.todo) }
                    .buttonStyle(.bordered)
                    .font(.footnote.weight(.semibold))
            }
        }
    }

    private func update(_ status: TaskStatus) {
        Task { await agents.setStatus(task, to: status) }
    }
}

// MARK: - Appointment

private struct AppointmentBody: View {
    @Environment(AgentsStore.self) private var agents
    let task: AgentTask
    @State private var when = Date()
    @State private var editing = false

    private var p: JSONValue { task.payload }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let startsAt = p["starts_at"]?.string, HealyxDate.isLocalDateTime(startsAt), !editing {
                HStack(alignment: .firstTextBaseline) {
                    Text((HealyxDate.displayLocalDateTime(startsAt) ?? startsAt) + (p["location"]?.string.map { " · \($0)" } ?? ""))
                        .font(.subheadline.weight(.semibold))
                    Button("Change") {
                        when = HealyxDate.date(localDateTime: startsAt) ?? Date()
                        editing = true
                    }
                    .font(.footnote.weight(.semibold))
                    .buttonStyle(.borderless)
                }
                CalendarButton(items: TaskCalendar.items(for: task), note: "Includes alerts 1 day and 1 hour before.")
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text(editing ? "Correct the date and time" : "Once it's booked, enter the time to create reminders")
                        .font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                    HStack {
                        DatePicker("When", selection: $when, in: Date()...)
                            .labelsHidden()
                        Spacer()
                        Button("Save") { save() }
                            .buttonStyle(.borderedProminent)
                    }
                }
                .padding(12)
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(Theme.border, style: StrokeStyle(lineWidth: 1, dash: [4])))
            }
            DraftBlock(label: "Request message", symbol: "text.bubble", text: p["request_message"]?.string)
            DraftBlock(label: "Call script", symbol: "phone", text: p["phone_script"]?.string)
            BulletBlock(label: "Questions to ask", items: p["questions_to_ask"]?.stringArray ?? [])
        }
    }

    private func save() {
        let local = HealyxDate.localDateTimeString(when)
        editing = false
        let selected = when
        Task { await agents.updatePayload(task, patch: ["starts_at": .string(local)], dueAt: selected) }
    }
}

// MARK: - Medication reminder

private struct MedReminderBody: View {
    @Environment(AgentsStore.self) private var agents
    let task: AgentTask
    @State private var times: [Date] = []

    private var p: JSONValue { task.payload }
    private var saved: [String] { p["times"]?.stringArray ?? ["08:00"] }
    private var edited: [String] { times.map(Self.clock) }
    private var changed: Bool { !times.isEmpty && edited != saved }

    private var daysLabel: String {
        let days = Weekday.parse(p["days"]?.stringArray ?? [])
        return days.isEmpty ? "Every day at" : "On \(days.map(\.shortName).joined(separator: ", ")) at"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let instructions = p["instructions"]?.string {
                Text(instructions).font(.footnote).foregroundStyle(Theme.muted)
            }
            Text(daysLabel).font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
            ForEach(times.indices, id: \.self) { index in
                DatePicker("Reminder \(index + 1)", selection: $times[index], displayedComponents: .hourAndMinute)
            }
            if changed {
                Button("Save times") {
                    let patch: [String: JSONValue] = ["times": .array(edited.map { .string($0) }), "times_confirmed": .bool(true)]
                    Task { await agents.updatePayload(task, patch: patch, dueAt: nil) }
                }
                .buttonStyle(.bordered)
            } else if p["times_confirmed"]?.bool != true {
                Text("Suggested times. Match them to your prescription label.")
                    .font(.caption).foregroundStyle(Theme.warning)
            }
            CalendarButton(items: calendarItems)
        }
        .onAppear { times = saved.compactMap(Self.date(fromClock:)) }
        .onChange(of: saved) { times = saved.compactMap(Self.date(fromClock:)) }
    }

    /// Uses the times on screen, so edits apply even before they're saved.
    private var calendarItems: [CalendarItem] {
        var copy = task
        var payload = copy.payload.object ?? [:]
        payload["times"] = .array(edited.map { .string($0) })
        copy.payload = .object(payload)
        return TaskCalendar.items(for: copy)
    }

    static func date(fromClock value: String) -> Date? {
        HealyxDate.date(localDateTime: "2000-01-01T\(value)")
    }

    static func clock(_ date: Date) -> String {
        String(HealyxDate.localDateTimeString(date).suffix(5))
    }
}

// MARK: - Refill

private struct RefillBody: View {
    @Environment(AgentsStore.self) private var agents
    let task: AgentTask
    @State private var remindOn = Date()

    private var p: JSONValue { task.payload }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            let careTeam = [p["pharmacy"]?.string.map { "Pharmacy: \($0)" }, p["prescriber"]?.string.map { "Prescriber: \($0)" }]
                .compactMap { $0 }.joined(separator: " · ")
            if !careTeam.isEmpty {
                Text(careTeam).font(.footnote).foregroundStyle(Theme.muted)
            }
            if let runsOut = p["runs_out_on"]?.string {
                let daysLeft = p["days_left"]?.int ?? 0
                VStack(alignment: .leading, spacing: 4) {
                    Text("About \(daysLeft) \(daysLeft == 1 ? "day" : "days") left. Runs out around \(HealyxDate.displayDay(runsOut) ?? runsOut).")
                        .font(.footnote.weight(.semibold))
                    if let supply = p["supply_remaining"]?.double, let perDay = p["doses_per_day"]?.double {
                        Text("Based on \(jsNumberString(supply)) doses at \(jsNumberString(perDay)) a day. Reminder on \(HealyxDate.displayDay(p["remind_on"]?.string) ?? "–"), 5 days ahead.")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            if HealyxDate.isLocalDate(p["remind_on"]?.string) {
                CalendarButton(items: TaskCalendar.items(for: task))
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Pick a day to be reminded to request it").font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                    HStack {
                        DatePicker("Remind me on", selection: $remindOn, in: Date()..., displayedComponents: .date)
                            .labelsHidden()
                        Spacer()
                        Button("Save") { save() }.buttonStyle(.borderedProminent)
                    }
                }
            }
            DraftBlock(label: "Refill request", symbol: "text.bubble", text: p["message"]?.string)
            DraftBlock(label: "Call script", symbol: "phone", text: p["phone_script"]?.string)
        }
    }

    private func save() {
        let day = HealyxDate.localDateString(remindOn)
        let due = HealyxDate.date(localDateTime: "\(day)T09:00")
        Task { await agents.updatePayload(task, patch: ["remind_on": .string(day)], dueAt: due) }
    }
}

// MARK: - Research brief

private struct ResearchBody: View {
    let task: AgentTask

    private var p: JSONValue { task.payload }
    private var sources: [JSONValue] { p["sources"]?.array ?? [] }
    private var mentions: [JSONValue] { p["label_mentions"]?.array ?? [] }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            let points = p["points"]?.array ?? []
            if points.isEmpty {
                Text("No summary points could be tied to a source. Open the sources below.")
                    .font(.footnote).foregroundStyle(Theme.muted)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(points.enumerated()), id: \.offset) { _, point in
                        Text(citedText(point)).font(.footnote)
                    }
                }
            }

            if !mentions.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Label("FDA label mentions something in your records", systemImage: "exclamationmark.triangle.fill")
                        .font(.caption.weight(.semibold)).foregroundStyle(Theme.warning)
                    ForEach(Array(mentions.enumerated()), id: \.offset) { _, m in
                        VStack(alignment: .leading, spacing: 3) {
                            Text("\(m["drug"]?.string ?? "A") label, \(m["section"]?.string ?? "warnings"), mentions “\(m["matched"]?.string ?? m["term"]?.string ?? "")”")
                                .font(.caption.weight(.medium))
                            if let excerpt = m["excerpt"]?.string {
                                Text(excerpt).font(.caption).italic().foregroundStyle(Theme.muted)
                            }
                            if let url = m["url"]?.string.flatMap(URL.init(string:)) {
                                Link("Read the full label", destination: url).font(.caption)
                            }
                        }
                    }
                    Text("A mention is not a confirmed interaction. Ask your pharmacist what it means for you.")
                        .font(.caption2).foregroundStyle(Theme.muted)
                }
                .padding(12)
                .background(Theme.warning.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            } else if sources.contains(where: { $0["kind"]?.string == "fda_label" }), (p["terms_checked"]?.int ?? 0) > 0 {
                Text("We searched these labels for your \(p["terms_checked"]?.int ?? 0) saved medication and condition names, plus common equivalents, and found no mentions. Labels can word things differently, so this is not a clearance.")
                    .font(.caption).foregroundStyle(Theme.muted)
            }

            BulletBlock(label: "Questions for your clinician or pharmacist", items: p["ask_clinician"]?.stringArray ?? [])

            if let limits = p["limits"]?.string {
                Text(limits).font(.caption).foregroundStyle(Theme.muted)
            }

            if !sources.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Sources").font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                    ForEach(Array(sources.enumerated()), id: \.offset) { _, source in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text("\(source["n"]?.int ?? 0)").font(.caption2.weight(.bold)).foregroundStyle(Theme.primary)
                            VStack(alignment: .leading, spacing: 2) {
                                if let url = source["url"]?.string.flatMap(URL.init(string:)) {
                                    Link(source["title"]?.string ?? url.absoluteString, destination: url).font(.caption)
                                } else {
                                    Text(source["title"]?.string ?? "Source").font(.caption)
                                }
                                if let meta = source["meta"]?.string {
                                    Text(meta).font(.caption2).foregroundStyle(Theme.muted)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /// The point's text followed by tappable [n] citations.
    private func citedText(_ point: JSONValue) -> AttributedString {
        var text = AttributedString(point["text"]?.string ?? "")
        for n in (point["cites"]?.array ?? []).compactMap(\.int) {
            var cite = AttributedString(" [\(n)]")
            if let source = sources.first(where: { $0["n"]?.int == n }),
               let url = source["url"]?.string.flatMap(URL.init(string:)) {
                cite.link = url
            }
            text += cite
        }
        return text
    }
}

// MARK: - Shopping list

private struct ShoppingBody: View {
    let task: AgentTask

    private var p: JSONValue { task.payload }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array((p["items"]?.array ?? []).enumerated()), id: \.offset) { _, item in
                VStack(alignment: .leading, spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item["name"]?.string ?? "Item").font(.subheadline.weight(.semibold))
                        if let why = item["why"]?.string {
                            Text(why).font(.caption).foregroundStyle(Theme.muted)
                        }
                    }
                    if let lookFor = item["look_for"]?.string {
                        Text("**Look for:** \(lookFor)").font(.caption)
                    }
                    if let check = item["label_check"], check.object != nil {
                        LabelCheck(check: check)
                    }
                    HStack(spacing: 8) {
                        ForEach(StoreSearch.allCases, id: \.self) { store in
                            if let url = store.url(for: item["search_terms"]?.string ?? item["name"]?.string ?? "") {
                                Link(destination: url) {
                                    Label(store.rawValue, systemImage: "arrow.up.right.square")
                                        .font(.caption)
                                }
                                .buttonStyle(.bordered)
                            }
                        }
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.secondary.opacity(0.5), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            if let notes = p["notes"]?.string {
                Text(notes).font(.caption).foregroundStyle(Theme.muted)
            }
            Text("Store links open a search. Healyx doesn't see prices or place orders. Ask a pharmacist before starting any medicine or supplement.")
                .font(.caption2).foregroundStyle(Theme.muted)
        }
    }
}

private struct LabelCheck: View {
    let check: JSONValue

    var body: some View {
        if check["checked"]?.bool == true {
            let matches = check["matches"]?.array ?? []
            let product = check["product"]?.string ?? "product"
            VStack(alignment: .leading, spacing: 6) {
                if matches.isEmpty {
                    Text("Checked the \(product) label: none of your \(check["terms_checked"]?.int ?? 0) saved medication or condition names (or common equivalents) appear in its warnings. Labels can word things differently, so read them yourself.")
                        .font(.caption).foregroundStyle(Theme.muted)
                } else {
                    Label("The \(product) label mentions your records", systemImage: "exclamationmark.triangle.fill")
                        .font(.caption.weight(.semibold)).foregroundStyle(Theme.warning)
                    ForEach(Array(matches.enumerated()), id: \.offset) { _, m in
                        Text("**\(m["section"]?.string ?? "Warning")** (“\(m["matched"]?.string ?? m["term"]?.string ?? "")”): \(m["excerpt"]?.string ?? "")")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                if let url = check["url"]?.string.flatMap(URL.init(string:)) {
                    Link("Full FDA label", destination: url).font(.caption)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background((matches.isEmpty ? Theme.secondary : Theme.warning.opacity(0.12)), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        } else if let reason = check["reason"]?.string {
            Text(reason).font(.caption).foregroundStyle(Theme.muted)
        }
    }
}

// MARK: - Building blocks

/// A draft message with Copy and Share.
struct DraftBlock: View {
    let label: String
    let symbol: String
    let text: String?
    @State private var copied = false

    var body: some View {
        if let text, !text.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label(label, systemImage: symbol).font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                    Spacer()
                    Button {
                        Clipboard.copy(text)
                        copied = true
                        Task {
                            try? await Task.sleep(for: .seconds(1.5))
                            copied = false
                        }
                    } label: {
                        Label(copied ? "Copied" : "Copy", systemImage: copied ? "checkmark" : "doc.on.doc")
                    }
                    .font(.caption.weight(.semibold))
                    .buttonStyle(.borderless)
                    ShareLink(item: text) {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .font(.caption.weight(.semibold))
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Share \(label.lowercased())")
                }
                Text(text).font(.footnote).textSelection(.enabled)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.secondary.opacity(0.5), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }
}

/// A bulleted list with a Copy button.
struct BulletBlock: View {
    let label: String
    let items: [String]

    var body: some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(label).font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                    Spacer()
                    Button {
                        Clipboard.copy(items.map { "- \($0)" }.joined(separator: "\n"))
                    } label: {
                        Label("Copy", systemImage: "doc.on.doc")
                    }
                    .font(.caption.weight(.semibold))
                    .buttonStyle(.borderless)
                }
                ForEach(items, id: \.self) { item in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Circle().fill(Theme.primary).frame(width: 5, height: 5)
                        Text(item).font(.footnote)
                    }
                }
            }
        }
    }
}

/// Adds events straight to the person's calendar.
struct CalendarButton: View {
    let items: [CalendarItem]
    var note: String?
    @State private var result: String?
    @State private var working = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button {
                add()
            } label: {
                Label("Add to Calendar", systemImage: "calendar.badge.plus")
            }
            .buttonStyle(.bordered)
            .disabled(items.isEmpty || working)
            Text(result ?? note ?? "Healyx can add events but can never read your calendar.")
                .font(.caption2).foregroundStyle(Theme.muted)
        }
    }

    private func add() {
        working = true
        let events = items
        Task {
            do {
                let count = try await CalendarService.shared.add(events)
                result = count == 1 ? "Added to your calendar." : "Added \(count) repeating reminders to your calendar."
            } catch {
                result = error.localizedDescription
            }
            working = false
        }
    }
}
