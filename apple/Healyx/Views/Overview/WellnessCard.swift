import SwiftUI
import HealyxKit

/// Sleep, recovery, stress and nutrition rings from Apple Health.
struct WellnessCard: View {
    @Environment(WellnessStore.self) private var wellness

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if !wellness.isAvailable && wellness.snapshot == nil {
                unavailable
            } else if wellness.isAvailable && !wellness.connected {
                connectPrompt
            } else {
                connectedContent
            }
            if let error = wellness.errorMessage {
                ErrorBanner(message: error) { wellness.errorMessage = nil }
            }
        }
        .card()
    }

    // MARK: States

    private var unavailable: some View {
        HStack(alignment: .top, spacing: 12) {
            IconBadge(symbol: "heart.text.square.fill", color: Theme.pink, size: 36)
            VStack(alignment: .leading, spacing: 4) {
                Text("Today from Apple Health").font(.headline)
                Text(wellness.isLoading
                     ? "Loading the scores your iPhone synced…"
                     : "Open Healyx on your iPhone and connect Apple Health. Your sleep, recovery, stress and nutrition scores will show here once it syncs.")
                    .font(.footnote).foregroundStyle(Theme.muted)
            }
        }
    }

    private var connectPrompt: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                IconBadge(symbol: "heart.text.square.fill", color: Theme.pink, size: 36)
                Text("Today from Apple Health").font(.headline)
            }
            Text("Healyx reads your sleep, heart rate variability, resting heart rate, heart rate, workouts and food logs to estimate daily sleep, recovery, stress and nutrition scores. It never writes to Apple Health, and the data stays on this iPhone. Scores are Healyx estimates, not medical measurements.")
                .font(.footnote).foregroundStyle(Theme.muted)
            Button {
                Task { await wellness.connect() }
            } label: {
                Label("Connect Apple Health", systemImage: "heart.fill")
            }
            .buttonStyle(PrimaryButtonStyle())
        }
    }

    private var connectedContent: some View {
        let snapshot = wellness.snapshot
        return VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(wellness.isAvailable ? "Today from Apple Health" : "Synced from your iPhone").font(.headline)
                    if !wellness.isAvailable, let day = wellness.syncedDay {
                        Text(HealyxDate.displayDay(day) ?? day).font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                Spacer()
                if wellness.isLoading {
                    ProgressView().controlSize(.small)
                } else {
                    Button {
                        Task { await wellness.refresh() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .font(.subheadline.weight(.semibold))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.primary)
                    .accessibilityLabel("Refresh")
                }
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 18) {
                MetricRing(progress: snapshot?.sleep.map { Double($0.score) / 100 }, color: Theme.indigo,
                           label: "Sleep", valueText: snapshot?.sleep.map { "\($0.score)" }, size: 88)
                MetricRing(progress: snapshot?.recovery.map { Double($0.score) / 100 }, color: Theme.green,
                           label: "Recovery", valueText: snapshot?.recovery.map { "\($0.score)" }, size: 88)
                MetricRing(progress: snapshot?.stress.map { Double($0.score) / 100 }, color: Theme.amber,
                           label: snapshot?.stress.map { "Stress · \($0.level)" } ?? "Stress",
                           valueText: snapshot?.stress.map { "\($0.score)" }, size: 88)
                MetricRing(progress: snapshot?.nutrition?.score.map { Double($0) / 100 }, color: Theme.pink,
                           label: "Nutrition", valueText: snapshot?.nutrition?.score.map { "\($0)" }, size: 88)
            }

            VStack(alignment: .leading, spacing: 10) {
                row("moon.fill", Theme.indigo, sleepText(snapshot?.sleep))
                row("bolt.heart.fill", Theme.green, recoveryText(snapshot?.recovery))
                row("waveform.path.ecg", Theme.amber, stressText(snapshot?.stress))
                row("fork.knife", Theme.pink, nutritionText(snapshot?.nutrition))
            }

            Text("Healyx estimates from Apple Health, not medical measurements.")
                .font(.caption).foregroundStyle(Theme.muted)
        }
    }

    private func row(_ symbol: String, _ color: Color, _ text: String) -> some View {
        HStack(alignment: .center, spacing: 10) {
            IconBadge(symbol: symbol, color: color, size: 28)
            Text(text).font(.footnote).foregroundStyle(Theme.foreground)
            Spacer(minLength: 0)
        }
    }

    // MARK: Detail text

    private func sleepText(_ sleep: SleepResult?) -> String {
        guard let sleep else { return "Wear your Apple Watch to sleep to get a sleep score." }
        guard sleep.asleepMinutes > 0 else { return "Sleep score \(sleep.score)" }
        var parts = ["\(duration(sleep.asleepMinutes)) asleep of \(duration(sleep.needMinutes))"]
        if let deep = sleep.deepMinutes { parts.append("Deep \(duration(deep))") }
        if let rem = sleep.remMinutes { parts.append("REM \(duration(rem))") }
        return parts.joined(separator: " · ")
    }

    private func recoveryText(_ recovery: RecoveryResult?) -> String {
        guard let recovery else {
            return "Recovery needs a few days of heart rate variability and resting heart rate from your Apple Watch."
        }
        var parts: [String] = []
        if let today = recovery.hrvToday {
            parts.append("HRV \(Int(today.rounded())) ms" + (recovery.hrvBaseline.map { " vs \(Int($0.rounded())) usual" } ?? ""))
        }
        if let today = recovery.restingToday {
            parts.append("Resting HR \(Int(today.rounded()))" + (recovery.restingBaseline.map { " vs \(Int($0.rounded()))" } ?? ""))
        }
        return parts.isEmpty ? "Based on your recent heart data." : parts.joined(separator: " · ")
    }

    private func stressText(_ stress: StressResult?) -> String {
        guard let stress else {
            return "Stress needs today's heart rate and a few days of resting heart rate from your Apple Watch."
        }
        guard let average = stress.averageHR, let resting = stress.restingReference, resting > 0 else {
            return "Based on today's heart rate variability."
        }
        let percent = Int(((average - resting) / resting * 100).rounded())
        let comparison = percent >= 0 ? "\(percent)% above resting" : "\(-percent)% below resting"
        return "Daytime heart rate \(Int(average.rounded())) bpm, \(comparison)"
    }

    private func nutritionText(_ nutrition: NutritionResult?) -> String {
        guard let nutrition else {
            return "Log meals in an app that saves to Apple Health (like MyFitnessPal) to see this."
        }
        var parts = ["\(nutrition.energyKcal.formatted(.number.precision(.fractionLength(0)))) kcal"]
        if let protein = nutrition.proteinPct, let carbs = nutrition.carbsPct, let fat = nutrition.fatPct {
            parts.append("Protein \(protein)%")
            parts.append("Carbs \(carbs)%")
            parts.append("Fat \(fat)%")
        } else {
            parts.append("add protein, carbs and fat to get a score")
        }
        return parts.joined(separator: " · ")
    }

    private func duration(_ minutes: Int) -> String {
        let hours = minutes / 60
        let rest = minutes % 60
        if hours == 0 { return "\(rest)m" }
        return rest == 0 ? "\(hours)h" : "\(hours)h \(rest)m"
    }
}
