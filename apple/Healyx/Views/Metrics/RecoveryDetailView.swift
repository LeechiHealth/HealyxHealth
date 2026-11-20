import SwiftUI
import Charts
import HealyxKit

/// Recovery as a full page: the big ring, HRV and resting heart rate against your
/// usual, a plain-language note, and the last 7 days.
struct RecoveryDetailView: View {
    @Environment(WellnessStore.self) private var wellness

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let snapshot = wellness.snapshot, let recovery = snapshot.recovery {
                    hero(recovery, date: snapshot.computedAt)
                    tiles(recovery)
                    insight(recovery)
                    timeline(snapshot.recoveryHistory)
                } else {
                    DetailEmptyState(symbol: "leaf.fill", title: "No recovery score yet",
                                     detail: "Recovery compares your overnight HRV and resting heart rate with your usual. Wear an Apple Watch to sleep for a few nights to build your baseline.")
                }
                DetailFootnote()
            }
            .padding(20)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .healyxBackground()
        .navigationTitle("Recovery")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .refreshable { await wellness.refresh() }
    }

    private func hero(_ recovery: RecoveryResult, date: Date) -> some View {
        VStack(spacing: 14) {
            Text(DetailFormat.day(date))
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Theme.muted)
            ZStack {
                Circle()
                    .fill(Theme.card)
                    .frame(width: 210, height: 210)
                    .shadow(color: Theme.shadow.opacity(0.12), radius: 20, y: 8)
                MiniRing(progress: Double(recovery.score) / 100, color: Theme.green, size: 170, lineWidth: 16)
                VStack(spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 1) {
                        Text("\(recovery.score)")
                            .font(.system(size: 46, weight: .semibold, design: .rounded).monospacedDigit())
                        Text("%").font(.title3.weight(.semibold))
                    }
                    .foregroundStyle(Theme.green)
                    Text("Recovered").font(.footnote).foregroundStyle(Theme.muted)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 26)
        .background(
            LinearGradient(colors: [Theme.green.opacity(0.16), Theme.washTop.opacity(0.6), Theme.card.opacity(0)],
                           startPoint: .top, endPoint: .bottom),
            in: RoundedRectangle(cornerRadius: 28, style: .continuous)
        )
    }

    private func tiles(_ recovery: RecoveryResult) -> some View {
        HStack(spacing: 12) {
            DetailTile(title: "Resting HRV", symbol: "waveform.path.ecg",
                       value: recovery.hrvToday.map { DetailFormat.number($0, decimals: 1) } ?? "–", unit: "ms",
                       trendUp: trend(recovery.hrvToday, recovery.hrvBaseline),
                       trendColor: (recovery.hrvToday ?? 0) >= (recovery.hrvBaseline ?? 0) ? Theme.green : Theme.amber,
                       footnote: recovery.hrvBaseline.map { "Usual \(DetailFormat.number($0, decimals: 1)) ms" })
            DetailTile(title: "Resting HR", symbol: "heart.fill",
                       value: recovery.restingToday.map { DetailFormat.number($0, decimals: 1) } ?? "–", unit: "bpm",
                       trendUp: trend(recovery.restingToday, recovery.restingBaseline),
                       trendColor: (recovery.restingToday ?? 0) <= (recovery.restingBaseline ?? 0) ? Theme.green : Theme.amber,
                       footnote: recovery.restingBaseline.map { "Usual \(DetailFormat.number($0, decimals: 1)) bpm" })
        }
    }

    private func trend(_ today: Double?, _ usual: Double?) -> Bool? {
        guard let today, let usual, abs(today - usual) >= 0.5 else { return nil }
        return today > usual
    }

    private func insight(_ recovery: RecoveryResult) -> some View {
        let (title, symbol, color) = headline(recovery.score)
        return VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: symbol)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(color)
            Text(insightText(recovery))
                .font(.subheadline)
                .foregroundStyle(Theme.foreground)
        }
        .card()
    }

    private func headline(_ score: Int) -> (String, String, Color) {
        if score >= 67 { return ("Ready to go", "bolt.fill", Theme.green) }
        if score >= 34 { return ("Steady today", "leaf.fill", Theme.teal) }
        return ("Time to take it easy", "leaf.fill", Theme.amber)
    }

    private func insightText(_ recovery: RecoveryResult) -> String {
        var sentences: [String] = []
        if let hrv = recovery.hrvToday, let usual = recovery.hrvBaseline {
            let relation = hrv >= usual * 1.05 ? "above" : hrv <= usual * 0.95 ? "below" : "close to"
            sentences.append("Your resting HRV is \(DetailFormat.number(hrv, decimals: 1)) ms, \(relation) your usual \(DetailFormat.number(usual, decimals: 1)) ms.")
        }
        if let resting = recovery.restingToday, let usual = recovery.restingBaseline {
            let diff = resting - usual
            if abs(diff) < 1.5 {
                sentences.append("Resting heart rate is steady at \(DetailFormat.number(resting)) bpm.")
            } else {
                sentences.append("Resting heart rate is \(DetailFormat.number(abs(diff))) bpm \(diff > 0 ? "higher" : "lower") than usual.")
            }
        }
        if recovery.score >= 67 {
            sentences.append("A good day for a harder effort if you feel up to it.")
        } else if recovery.score >= 34 {
            sentences.append("A normal day. Train as planned and listen to how you feel.")
        } else {
            sentences.append("Today might be a good day to scale back and prioritize rest.")
        }
        return sentences.joined(separator: " ")
    }

    private func timeline(_ history: [TimedValue]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recovery timeline").font(.headline).foregroundStyle(Theme.foreground)
            if history.count < 2 {
                Text("Your last 7 days show here once there are a few nights of HRV and resting heart rate.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
            } else {
                Chart(history, id: \.date) { point in
                    BarMark(x: .value("Day", point.date, unit: .day),
                            y: .value("Recovery", point.value))
                        .foregroundStyle(barColor(point.value))
                        .cornerRadius(6)
                }
                .chartYScale(domain: 0...100)
                .chartXAxis {
                    AxisMarks(values: .stride(by: .day)) { _ in
                        AxisValueLabel(format: .dateTime.weekday(.narrow))
                    }
                }
                .frame(height: 180)
            }
        }
        .card()
    }

    private func barColor(_ value: Double) -> Color {
        value >= 67 ? Theme.green : value >= 34 ? Theme.teal : Theme.amber
    }
}
