import SwiftUI
import Charts
import HealyxKit

/// Today's stress as a sheet: score, today's range, a chart and the heart rate behind it.
struct StressDetailView: View {
    @Environment(WellnessStore.self) private var wellness
    @Environment(\.dismiss) private var dismiss

    enum Series: String, CaseIterable, Identifiable {
        case stress = "Stress score"
        case heartRate = "Daytime HR"
        case hrv = "HRV"
        var id: String { rawValue }
    }

    @State private var series: Series = .stress

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header

                if let snapshot = wellness.snapshot, let stress = snapshot.stress {
                    summary(stress, snapshot: snapshot)
                    DetailChips(options: Series.allCases, title: { $0.rawValue }, selection: $series)
                    chart(snapshot)
                        .frame(height: 220)
                        .card(padding: 14)
                    HStack(spacing: 12) {
                        DetailTile(title: "Daytime HR", symbol: "heart.fill",
                                   value: stress.averageHR.map { DetailFormat.number($0) } ?? "–", unit: "bpm",
                                   footnote: "Outside workouts")
                        DetailTile(title: "Resting HR", symbol: "bed.double.fill",
                                   value: stress.restingReference.map { DetailFormat.number($0) } ?? "–", unit: "bpm",
                                   footnote: "Your usual")
                    }
                    Text(explanation(stress))
                        .font(.subheadline)
                        .foregroundStyle(Theme.foreground)
                        .card()
                } else {
                    DetailEmptyState(symbol: "waveform.path.ecg", title: "No stress score yet",
                                     detail: "Stress uses your daytime heart rate and HRV from an Apple Watch. Wear it during the day and check back.")
                }
                DetailFootnote()
            }
            .padding(20)
            .frame(maxWidth: 680)
            .frame(maxWidth: .infinity)
        }
        .healyxBackground()
        #if os(iOS)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        #else
        .frame(minWidth: 480, minHeight: 640)
        #endif
    }

    private var header: some View {
        ZStack {
            Text("Stress Score").font(.headline).foregroundStyle(Theme.foreground)
            HStack {
                DetailCloseButton { dismiss() }
                Spacer()
            }
        }
    }

    private func summary(_ stress: StressResult, snapshot: WellnessSnapshot) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("\(stress.score)")
                        .font(.system(size: 44, weight: .semibold, design: .rounded).monospacedDigit())
                    Text("%").font(.title3.weight(.semibold)).foregroundStyle(Theme.muted)
                }
                .foregroundStyle(Theme.foreground)
                Text("\(stress.level) · \(DetailFormat.day(snapshot.computedAt))")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
            Spacer()
            if let range = snapshot.stressRange {
                VStack(alignment: .trailing, spacing: 4) {
                    Text(range.contains(stress.score) ? "Within today's range" : "Outside today's range")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(range.contains(stress.score) ? Theme.green : Theme.amber)
                    Label("\(range.lowerBound) - \(range.upperBound)%", systemImage: "line.3.horizontal")
                        .font(.footnote)
                        .foregroundStyle(Theme.muted)
                }
            }
        }
    }

    @ViewBuilder private func chart(_ snapshot: WellnessSnapshot) -> some View {
        switch series {
        case .stress:
            lineChart(snapshot.stressHourly, color: Theme.amber, unit: "%", domain: 0...100,
                      empty: "Hourly stress shows once there's daytime heart rate from today.")
        case .heartRate:
            lineChart(snapshot.heartRateHourly, color: Theme.pink, unit: " bpm", domain: nil,
                      empty: "No daytime heart rate from today yet.")
        case .hrv:
            lineChart(snapshot.hrvDaily, color: Theme.indigo, unit: " ms", domain: nil, byDay: true,
                      empty: "HRV history shows after a few nights with an Apple Watch.")
        }
    }

    @ViewBuilder
    private func lineChart(_ points: [TimedValue], color: Color, unit: String, domain: ClosedRange<Double>?,
                           byDay: Bool = false, empty: String) -> some View {
        if points.count < 2 {
            Text(empty)
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            let average = points.map(\.value).reduce(0, +) / Double(points.count)
            Chart {
                ForEach(points, id: \.date) { point in
                    AreaMark(x: .value("Time", point.date, unit: byDay ? .day : .hour),
                             y: .value("Value", point.value))
                        .foregroundStyle(LinearGradient(colors: [color.opacity(0.25), color.opacity(0.02)],
                                                        startPoint: .top, endPoint: .bottom))
                        .interpolationMethod(.catmullRom)
                    LineMark(x: .value("Time", point.date, unit: byDay ? .day : .hour),
                             y: .value("Value", point.value))
                        .foregroundStyle(color)
                        .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round))
                        .interpolationMethod(.catmullRom)
                    PointMark(x: .value("Time", point.date, unit: byDay ? .day : .hour),
                              y: .value("Value", point.value))
                        .foregroundStyle(color)
                        .symbolSize(24)
                }
                RuleMark(y: .value("Average", average))
                    .foregroundStyle(Theme.muted.opacity(0.7))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    .annotation(position: .top, alignment: .leading) {
                        Text("Avg \(DetailFormat.number(average))\(unit)")
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .foregroundStyle(.white)
                            .background(color, in: Capsule())
                    }
            }
            .chartYScale(domain: domain ?? autoDomain(points))
        }
    }

    private func autoDomain(_ points: [TimedValue]) -> ClosedRange<Double> {
        let values = points.map(\.value)
        let low = (values.min() ?? 0) * 0.9
        let high = (values.max() ?? 1) * 1.1
        return low...max(high, low + 1)
    }

    private func explanation(_ stress: StressResult) -> String {
        switch stress.level {
        case "Low":
            return "Your body looks calm today. Heart rate is close to your resting level outside workouts."
        case "Moderate":
            return "Some stress today. Heart rate has run above your resting level at times, which is normal on a busy day."
        default:
            return "Stress is running high. Heart rate has stayed well above your resting level outside workouts. A walk, slow breathing or an earlier night can help."
        }
    }
}
