import SwiftUI
import HealyxKit

// Lab and record cards shown on Home (moved from the old Overview screen).

// MARK: - Rings

/// Two rings from saved data (labs in range, the optional snapshot) and the lab counts.
struct TodayRingsCard: View {
    let brief: HealthBrief
    let score: HealthScore
    let openRecords: () -> Void

    private var knownCount: Int { brief.inRange + brief.flagged }

    private var inRangeShare: Double? {
        knownCount > 0 ? Double(brief.inRange) / Double(knownCount) : nil
    }

    private var snapshot: Double? {
        score.measured > 0 ? Double(score.score) / 100 : nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text("Your labs today").font(.headline)
                Spacer()
                Button("Open records", action: openRecords)
                    .font(.caption.weight(.semibold))
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.primary)
            }

            HStack(alignment: .top, spacing: 0) {
                MetricRing(progress: inRangeShare, color: Theme.green, label: "Labs in range",
                           valueText: inRangeShare.map { "\(Int(($0 * 100).rounded()))" }, unit: "%")
                    .frame(maxWidth: .infinity)
                MetricRing(progress: snapshot, color: Theme.primary, label: "Snapshot",
                           valueText: snapshot == nil ? nil : "\(score.score)")
                    .frame(maxWidth: .infinity)
            }

            HStack(spacing: 10) {
                stat(brief.inRange, "In range", Theme.green)
                stat(brief.flagged, "Flagged", Theme.amber)
                stat(brief.unknown, "Unknown", Theme.muted)
            }

            Text(footnote)
                .font(.caption)
                .foregroundStyle(Theme.muted)
        }
        .card()
    }

    private var footnote: String {
        if brief.latest.isEmpty { return "Add a lab result to see your recorded ranges and follow changes over time." }
        var text = "\(brief.inRange) of \(knownCount) results with a known status are recorded in range. Flags describe saved results, not your overall health."
        if score.measured > 0 { text += " Snapshot uses \(score.measured) of \(score.total) factors; details below." }
        return text
    }

    private func stat(_ value: Int, _ label: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)")
                .font(.system(size: 22, weight: .semibold, design: .rounded).monospacedDigit())
                .foregroundStyle(color)
            Text(label).font(.caption).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Theme.secondary.opacity(0.7), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

// MARK: - Signals

struct SignalsCard: View {
    @Environment(AppRouter.self) private var router
    let brief: HealthBrief

    enum Filter: String, CaseIterable, Identifiable {
        case flagged = "Flagged", changes = "Changes", all = "All"
        var id: String { rawValue }
    }

    @State private var filter: Filter = .flagged

    private var shown: [BriefRecord] {
        brief.latest.filter { row in
            switch filter {
            case .all: return true
            case .changes: return row.change != nil
            case .flagged: return row.classification == .flagged
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Explore your signals").font(.headline)
                Spacer()
            }
            Picker("Filter", selection: $filter) {
                ForEach(Filter.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            if shown.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text(emptyTitle).font(.subheadline.weight(.medium))
                    Text(emptyDetail).font(.footnote).foregroundStyle(Theme.muted)
                }
                .padding(.vertical, 8)
            } else {
                ForEach(shown.prefix(5)) { row in
                    SignalRow(row: row) {
                        router.ask("Help me understand my \(row.record.name) results, what context is missing, and what questions I should explore next.")
                    }
                    if row.id != shown.prefix(5).last?.id { Divider() }
                }
                if shown.count > 5 {
                    Button("See all \(shown.count) results") { router.section = .records }
                        .font(.footnote.weight(.semibold))
                        .buttonStyle(.plain)
                        .foregroundStyle(Theme.primary)
                }
            }
        }
        .card()
    }

    private var emptyTitle: String {
        if brief.latest.isEmpty { return "Your baseline starts here." }
        switch filter {
        case .changes: return "No comparable changes yet."
        case .flagged: return "No recorded flags in this view."
        case .all: return "No results yet."
        }
    }

    private var emptyDetail: String {
        if brief.latest.isEmpty { return "Add a lab report in Health Records to see your recorded ranges and ask more specific questions." }
        if filter == .changes { return "Changes need numeric results with matching units on different valid dates. A change alone doesn't mean better or worse." }
        return "Unknown statuses stay unknown. Review all markers and their ranges in Health Records."
    }
}

struct SignalRow: View {
    let row: BriefRecord
    let ask: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(row.record.name).font(.subheadline.weight(.semibold))
                    Text("\(row.dateLabel) · \(statusText)").font(.caption).foregroundStyle(Theme.muted)
                }
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(row.record.valueText ?? "–").font(.title3.weight(.semibold).monospacedDigit())
                    Text(row.record.unit ?? "").font(.caption).foregroundStyle(Theme.muted)
                }
            }
            if let change = row.change {
                Text(change).font(.caption).foregroundStyle(Theme.muted)
            }
            Button(action: ask) {
                Label("Understand this", systemImage: "bubble.left.and.text.bubble.right")
            }
            .font(.caption.weight(.semibold))
            .buttonStyle(.plain)
            .foregroundStyle(Theme.primary)
        }
        .padding(.vertical, 4)
    }

    private var statusText: String {
        switch row.classification {
        case .unknown: return "Status unknown"
        case .flagged: return "Recorded \(row.record.status ?? "flag")"
        case .inRange: return "Recorded in range"
        }
    }
}

// MARK: - At a glance

struct AtAGlanceCard: View {
    @Environment(RecordsStore.self) private var records
    @Environment(AgentsStore.self) private var agents
    @Environment(AppRouter.self) private var router

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("At a glance").font(.headline)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                tile("Blood pressure", bloodPressure, "heart.fill", Theme.pink) { router.section = .records }
                tile("Weight", weight, "scalemass.fill", Theme.teal) { router.section = .records }
                tile("Medications", "\(records.activeMedications.count) active", "pills.fill", Theme.green) { router.section = .records }
                tile("Conditions", "\(records.activeConditions.count) active", "stethoscope", Theme.indigo) { router.section = .records }
                tile("Agent tasks", "\(agents.openTasks().count) open", "checklist", Theme.amber) { router.section = .agents }
            }
        }
        .card()
    }

    private var bloodPressure: String {
        guard let bp = records.latestBloodPressure, let s = bp.systolicBP, let d = bp.diastolicBP else { return "None yet" }
        return "\(jsNumberString(s))/\(jsNumberString(d))"
    }

    private var weight: String {
        guard let lbs = records.latestWeight?.weightLbs else { return "None yet" }
        return String(format: "%.1f lb", lbs)
    }

    private func tile(_ title: String, _ value: String, _ symbol: String, _ color: Color,
                      action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                IconBadge(symbol: symbol, color: color, size: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text(value).font(.headline).foregroundStyle(Theme.foreground)
                    Text(title).font(.caption).foregroundStyle(Theme.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Theme.secondary.opacity(0.7), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Optional score

struct ScoreCard: View {
    let score: HealthScore
    @State private var expanded = false

    private static let colors: [Color] = [Theme.green, Theme.indigo, Theme.primary, Theme.pink, Theme.amber, Theme.teal]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Optional wellness indicator").eyebrow()
                Text("Cardiometabolic snapshot").font(.headline).foregroundStyle(Theme.foreground)
                Text(score.measured > 0 ? "\(score.score)/100 · \(score.grade) · \(score.measured) of \(score.total) factors" : "Not enough data yet")
                    .font(.footnote).foregroundStyle(Theme.muted)
            }

            ForEach(Array(score.components.enumerated()), id: \.element.id) { index, component in
                factorRow(component, color: Self.colors[index % Self.colors.count])
            }

            Button {
                withAnimation(.snappy) { expanded.toggle() }
            } label: {
                HStack(spacing: 6) {
                    Text("How this is calculated")
                    Image(systemName: "chevron.down").rotationEffect(.degrees(expanded ? 180 : 0))
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.primary)
            }
            .buttonStyle(.plain)

            if expanded {
                Text("A simplified estimate from \(score.measured) of \(score.total) supported factors. This is not a validated total-health score. Missing factors are excluded, so different coverage can change what the number means.")
                    .font(.footnote).foregroundStyle(Theme.muted)
                Text("Formula: sum of available factor scores ÷ number of available factors, rounded. Inspired by AHA Life's Essential 8 categories; diet and medication or history adjustments are absent. Activity needs measured minutes.")
                    .font(.caption).foregroundStyle(Theme.muted)
            }
        }
        .card()
    }

    private func factorRow(_ component: ScoreComponent, color: Color) -> some View {
        HStack(alignment: .center, spacing: 12) {
            MiniRing(progress: component.score.map { Double($0) / 100 }, color: color, size: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(component.label).font(.subheadline.weight(.medium)).foregroundStyle(Theme.foreground)
                if let provenance = score.provenance[component.key] {
                    Text((provenance.reason ?? provenance.source) + (provenance.date.map { " · \($0)" } ?? ""))
                        .font(.caption).foregroundStyle(Theme.muted)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 8)
            Text(component.score.map { "\($0)" } ?? "Missing")
                .font(.subheadline.weight(.semibold).monospacedDigit())
                .foregroundStyle(component.score == nil ? Theme.muted : Theme.foreground)
        }
        .padding(12)
        .background(Theme.secondary.opacity(0.7), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
