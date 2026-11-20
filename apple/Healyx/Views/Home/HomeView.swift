import SwiftUI
import HealyxKit

/// Home: today's date, weather and activity, the Stress / Recovery / Sleep rings,
/// a one-line summary, then a card for each area and the lab cards.
struct HomeView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RecordsStore.self) private var records
    @Environment(AgentsStore.self) private var agents
    @Environment(AppRouter.self) private var router
    @Environment(WellnessStore.self) private var wellness

    @State private var weather = WeatherService()
    @State private var showStress = false
    @AppStorage(ActivityStatus.storageKey) private var status: ActivityStatus = .active

    private var snapshot: WellnessSnapshot? { wellness.snapshot }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                topRow
                chipsRow
                ringsCard
                summaryCard

                if let error = wellness.errorMessage {
                    ErrorBanner(message: error) { wellness.errorMessage = nil }
                }
                if let error = records.errorMessage {
                    ErrorBanner(message: error) { records.errorMessage = nil }
                }

                sectionTitle("Stress & Energy")
                Button { showStress = true } label: { stressCard }
                    .buttonStyle(.plain)

                sectionTitle("Recovery")
                NavigationLink { RecoveryDetailView() } label: { recoveryCard }
                    .buttonStyle(.plain)

                sectionTitle("Sleep")
                NavigationLink { SleepDetailView() } label: { sleepCard }
                    .buttonStyle(.plain)

                sectionTitle("Nutrition")
                NavigationLink { NutritionDetailView() } label: { nutritionCard }
                    .buttonStyle(.plain)

                sectionTitle("Biological Age")
                NavigationLink { BiologicalAgeView() } label: { biologicalAgeCard }
                    .buttonStyle(.plain)

                sectionTitle("Your labs")
                if records.hasLoaded {
                    TodayRingsCard(brief: records.brief, score: records.score) { router.section = .records }
                    SignalsCard(brief: records.brief)
                    AtAGlanceCard()
                    ScoreCard(score: records.score)
                } else {
                    ProgressView("Reading your records…")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 30)
                }

                sectionTitle("More")
                HStack(spacing: 12) {
                    shortcut("Health Records", "heart.text.square", Theme.pink) { router.section = .records }
                    shortcut("Agents", "person.2", Theme.indigo) { router.section = .agents }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 28)
            .frame(maxWidth: 820)
            .frame(maxWidth: .infinity)
        }
        .healyxBackground()
        .task {
            weather.start()
            if wellness.shouldRefresh { await wellness.refresh() }
        }
        .refreshable {
            await records.reload()
            await agents.reload()
            if wellness.shouldRefresh { await wellness.refresh() }
        }
        .sheet(isPresented: $showStress) {
            StressDetailView()
                .environment(wellness)
                .environment(records)
                .environment(session)
                #if os(iOS)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                #endif
        }
        .navigationTitle("Home")
        #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
        #endif
    }

    // MARK: Header

    private var topRow: some View {
        HStack(alignment: .center) {
            (Text("Today, ") + Text(Date.now, format: .dateTime.month(.wide).day()))
                .font(.system(size: 26, weight: .semibold))
                .tracking(-0.6)
                .foregroundStyle(Theme.foreground)
            Spacer()
            LogMenu()
            AccountMenu()
        }
        .padding(.top, 6)
    }

    private var chipsRow: some View {
        HStack(spacing: 8) {
            Menu {
                Picker("Activity", selection: $status) {
                    ForEach(ActivityStatus.allCases) { option in
                        Label(option.label, systemImage: option.symbol).tag(option)
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: status.symbol)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 22, height: 22)
                        .background(Theme.green, in: Circle())
                    VStack(alignment: .leading, spacing: 0) {
                        Text(status.label).font(.caption.weight(.semibold)).foregroundStyle(Theme.foreground)
                        Text("Until changed").font(.caption2).foregroundStyle(Theme.muted)
                    }
                    Image(systemName: "chevron.down").font(.caption2.weight(.bold)).foregroundStyle(Theme.muted)
                }
                .padding(.leading, 6)
                .padding(.trailing, 12)
                .padding(.vertical, 6)
                .background(Theme.card, in: Capsule())
                .shadow(color: Theme.shadow.opacity(0.06), radius: 8, x: 0, y: 3)
            }
            .buttonStyle(.plain)
            #if os(macOS)
            .menuStyle(.button)
            .menuIndicator(.hidden)
            .fixedSize()
            #endif

            if let temperature = weather.temperatureF {
                HStack(spacing: 6) {
                    Image(systemName: weather.symbol)
                        .symbolRenderingMode(.multicolor)
                    Text("\(temperature)°F").font(.caption.weight(.semibold)).foregroundStyle(Theme.foreground)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Theme.card, in: Capsule())
                .shadow(color: Theme.shadow.opacity(0.06), radius: 8, x: 0, y: 3)
                .accessibilityLabel("Weather \(temperature) degrees")
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: Rings

    private var ringsCard: some View {
        VStack(spacing: 14) {
            HStack(alignment: .top, spacing: 0) {
                Button { showStress = true } label: {
                    MetricRing(progress: snapshot?.stress.map { Double($0.score) / 100 }, color: Theme.amber,
                               label: "Stress", valueText: snapshot?.stress.map { "\($0.score)" }, size: 88)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity)

                NavigationLink { RecoveryDetailView() } label: {
                    MetricRing(progress: snapshot?.recovery.map { Double($0.score) / 100 }, color: Theme.green,
                               label: "Recovery", valueText: snapshot?.recovery.map { "\($0.score)" }, unit: "%", size: 88)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity)

                NavigationLink { SleepDetailView() } label: {
                    MetricRing(progress: snapshot?.sleep.map { Double($0.score) / 100 }, color: Theme.indigo,
                               label: "Sleep", valueText: snapshot?.sleep.map { "\($0.score)" }, unit: "%", size: 88)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity)
            }

            if wellness.isAvailable && !wellness.connected {
                Button {
                    Task { await wellness.connect() }
                } label: {
                    Label("Connect Apple Health", systemImage: "heart.fill")
                        .font(.footnote.weight(.semibold))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .foregroundStyle(Theme.pink)
                        .background(Theme.pink.opacity(0.12), in: Capsule())
                }
                .buttonStyle(.plain)
            } else if wellness.isLoading {
                ProgressView().controlSize(.small)
            }
        }
        .card(padding: 16)
    }

    // MARK: Summary

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: .now)
        let part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
        return part + (session.firstName.map { ", \($0)" } ?? "")
    }

    /// The summary sentence, without a greeting if it already starts with one.
    private var summary: String {
        var sentence = WellnessSummary.sentence(snapshot: snapshot, firstName: session.firstName, now: .now)
        if sentence.hasPrefix(greeting) {
            sentence = String(sentence.dropFirst(greeting.count))
                .trimmingCharacters(in: CharacterSet(charactersIn: " .,!").union(.whitespaces))
        }
        return sentence
    }

    private var summaryCard: some View {
        let hour = Calendar.current.component(.hour, from: .now)
        let daytime = hour >= 6 && hour < 18
        return HStack(alignment: .top, spacing: 12) {
            Image(systemName: daytime ? "sun.max.fill" : "moon.stars.fill")
                .font(.title3)
                .foregroundStyle(daytime ? Theme.amber : Theme.indigo)
            VStack(alignment: .leading, spacing: 4) {
                Text(greeting).font(.headline).foregroundStyle(Theme.foreground)
                if !summary.isEmpty {
                    Text(summary).font(.subheadline).foregroundStyle(Theme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .card()
    }

    // MARK: Domain cards

    private var stressCard: some View {
        let stress = snapshot?.stress
        return domainCard(
            symbol: "bolt.heart.fill", color: Theme.amber,
            value: stress.map { "\($0.score)" } ?? "–",
            unit: stress?.level,
            detail: stress?.averageHR.map { "Daytime heart rate \(Int($0.rounded())) bpm" }
                ?? "Needs a few days of Apple Watch heart rate data."
        )
    }

    private var recoveryCard: some View {
        let recovery = snapshot?.recovery
        var parts: [String] = []
        if let hrv = recovery?.hrvToday { parts.append("HRV \(Int(hrv.rounded())) ms") }
        if let rhr = recovery?.restingToday { parts.append("Resting HR \(Int(rhr.rounded())) bpm") }
        return domainCard(
            symbol: "leaf.fill", color: Theme.green,
            value: recovery.map { "\($0.score)%" } ?? "–",
            unit: recovery == nil ? nil : "recovered",
            detail: parts.isEmpty ? "Needs a few days of HRV and resting heart rate from your Apple Watch." : parts.joined(separator: " · ")
        )
    }

    private var sleepCard: some View {
        let sleep = snapshot?.sleep
        var detail = "Wear your Apple Watch to sleep to get a sleep score."
        if let sleep {
            var parts = ["of \(Self.duration(sleep.needMinutes)) needed"]
            if let deep = sleep.deepMinutes { parts.append("Deep \(Self.duration(deep))") }
            if let rem = sleep.remMinutes { parts.append("REM \(Self.duration(rem))") }
            detail = parts.joined(separator: " · ")
        }
        return domainCard(
            symbol: "moon.fill", color: Theme.indigo,
            value: sleep.map { Self.duration($0.asleepMinutes) } ?? "–",
            unit: sleep == nil ? nil : "asleep",
            detail: detail
        )
    }

    private var nutritionCard: some View {
        let nutrition = snapshot?.nutrition
        var detail = "Log meals in an app that saves to Apple Health (like MyFitnessPal) to see this."
        if let nutrition {
            var parts: [String] = []
            if let p = nutrition.proteinPct { parts.append("Protein \(p)%") }
            if let c = nutrition.carbsPct { parts.append("Carbs \(c)%") }
            if let f = nutrition.fatPct { parts.append("Fat \(f)%") }
            detail = parts.isEmpty ? "Calories logged, no macro breakdown yet." : parts.joined(separator: " · ")
        }
        return domainCard(
            symbol: "fork.knife", color: Theme.pink,
            value: nutrition.map { $0.energyKcal.formatted(.number.precision(.fractionLength(0))) } ?? "–",
            unit: nutrition == nil ? nil : "kcal",
            detail: detail
        )
    }

    private var biologicalAgeCard: some View {
        let age = wellness.biologicalAge?.age
        var detail = "Add recent bloodwork (albumin, creatinine, glucose, CRP, blood counts) to estimate this."
        if let age, let chronological = wellness.biologicalAge?.chronologicalAge {
            let difference = chronological - age
            if abs(difference) < 0.5 {
                detail = "About the same as your age."
            } else {
                detail = String(format: "%.1f years %@ than your age", abs(difference), difference > 0 ? "younger" : "older")
            }
        } else if age != nil {
            detail = "Estimated from your bloodwork."
        }
        return domainCard(
            symbol: "heart.circle.fill", color: Theme.teal,
            value: age.map { String(format: "%.1f", $0) } ?? "–",
            unit: age == nil ? nil : "years",
            detail: detail
        )
    }

    private func domainCard(symbol: String, color: Color, value: String, unit: String?, detail: String) -> some View {
        HStack(alignment: .center, spacing: 14) {
            IconBadge(symbol: symbol, color: color, size: 40)
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(value)
                        .font(.system(size: 24, weight: .semibold, design: .rounded).monospacedDigit())
                        .foregroundStyle(Theme.foreground)
                    if let unit {
                        Text(unit).font(.subheadline.weight(.medium)).foregroundStyle(Theme.muted)
                    }
                }
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.muted)
        }
        .card(padding: 16)
        .contentShape(Rectangle())
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(.title3.weight(.semibold))
            .foregroundStyle(Theme.foreground)
            .padding(.top, 6)
    }

    private func shortcut(_ title: String, _ symbol: String, _ color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                IconBadge(symbol: symbol, color: color, size: 32)
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.foreground)
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
            }
            .card(padding: 14)
        }
        .buttonStyle(.plain)
    }

    static func duration(_ minutes: Int) -> String {
        let hours = minutes / 60
        let rest = minutes % 60
        if hours == 0 { return "\(rest)m" }
        return rest == 0 ? "\(hours)h" : "\(hours)h \(rest)m"
    }
}
