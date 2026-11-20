import SwiftUI
import Charts
import HealyxKit

/// Last night's sleep on a dark navy page: the stages chart, time in each stage,
/// the sleep goal and how long it took to fall asleep.
struct SleepDetailView: View {
    @Environment(WellnessStore.self) private var wellness

    private let text = Color.white
    private let subtle = Color.white.opacity(0.65)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let snapshot = wellness.snapshot, let sleep = snapshot.sleep {
                    header(sleep)
                    stagesChart(segments(snapshot))
                    stageTiles(sleep)
                    goalRow(sleep)
                    if let minutes = sleep.minutesToFallAsleep {
                        row(title: "Time to fall asleep", value: DetailFormat.duration(minutes), symbol: "moon.zzz.fill")
                    }
                    row(title: "Sleep score", value: "\(sleep.score)", symbol: "moon.stars.fill")
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        Image(systemName: "moon.stars.fill").font(.title2).foregroundStyle(SleepPalette.rem)
                        Text("No sleep from last night").font(.headline).foregroundStyle(text)
                        Text("Wear your Apple Watch to bed (or use Sleep in the Health app) and your stages show here in the morning.")
                            .font(.subheadline).foregroundStyle(subtle)
                    }
                    .padding(18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(SleepPalette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                }
                Text("Healyx estimates from Apple Health, not medical measurements.")
                    .font(.caption)
                    .foregroundStyle(subtle)
            }
            .padding(20)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .background {
            LinearGradient(colors: [Color(hex: 0x232C5C), SleepPalette.navy], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        }
        .environment(\.colorScheme, .dark)
        .navigationTitle("Sleep")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .refreshable { await wellness.refresh() }
    }

    /// Staged samples win over plain "asleep" ones when a Watch recorded stages.
    private func segments(_ snapshot: WellnessSnapshot) -> [SleepSegment] {
        let all = snapshot.sleepSegments
        let staged = all.filter { [.core, .deep, .rem, .awake].contains($0.stage) }
        return staged.contains(where: { $0.stage != .awake }) ? staged : all
    }

    private func header(_ sleep: SleepResult) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Primary sleep").font(.title3.weight(.semibold)).foregroundStyle(text)
            if let start = sleep.fellAsleepAt {
                Text(start.formatted(.dateTime.month(.abbreviated).day()) + " at " + DetailFormat.time(start))
                    .font(.subheadline)
                    .foregroundStyle(subtle)
            }
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(DetailFormat.duration(sleep.asleepMinutes))
                    .font(.system(size: 40, weight: .semibold, design: .rounded))
                    .foregroundStyle(text)
                Text("asleep").font(.subheadline).foregroundStyle(subtle)
            }
            .padding(.top, 6)
        }
    }

    private func stageOrder(_ segments: [SleepSegment]) -> [String] {
        let present = Set(segments.map(\.stage))
        let order: [SleepStage] = [.awake, .rem, .core, .deep, .unspecified]
        return order.filter { present.contains($0) }.map(\.label)
    }

    @ViewBuilder private func stagesChart(_ segments: [SleepSegment]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Sleep stages").font(.headline).foregroundStyle(text)
            if segments.isEmpty {
                Text("No stage data for last night.").font(.subheadline).foregroundStyle(subtle)
            } else {
                Chart(Array(segments.enumerated()), id: \.offset) { _, segment in
                    RectangleMark(xStart: .value("Start", segment.start),
                                  xEnd: .value("End", segment.end),
                                  y: .value("Stage", segment.stage.label))
                        .foregroundStyle(SleepPalette.color(segment.stage))
                        .cornerRadius(3)
                }
                .chartYScale(domain: stageOrder(segments))
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                        AxisGridLine().foregroundStyle(Color.white.opacity(0.08))
                        AxisValueLabel(format: .dateTime.hour().minute()).foregroundStyle(subtle)
                    }
                }
                .chartYAxis {
                    AxisMarks { _ in
                        AxisValueLabel().foregroundStyle(subtle)
                    }
                }
                .frame(height: 200)
                if let first = segments.map(\.start).min(), let last = segments.map(\.end).max() {
                    HStack {
                        Label(DetailFormat.time(first), systemImage: "moon.fill")
                        Spacer()
                        Label(DetailFormat.time(last), systemImage: "sun.max.fill")
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(subtle)
                }
            }
        }
        .padding(16)
        .background(SleepPalette.card.opacity(0.7), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    @ViewBuilder private func stageTiles(_ sleep: SleepResult) -> some View {
        if let rem = sleep.remMinutes, let core = sleep.coreMinutes, let deep = sleep.deepMinutes {
            let awake = sleep.awakeMinutes ?? 0
            let total = max(Double(rem + core + deep + awake), 1)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                stageTile("Awake", minutes: awake, share: Double(awake) / total, color: SleepPalette.awake)
                stageTile("REM", minutes: rem, share: Double(rem) / total, color: SleepPalette.rem)
                stageTile("Core", minutes: core, share: Double(core) / total, color: SleepPalette.core)
                stageTile("Deep", minutes: deep, share: Double(deep) / total, color: SleepPalette.deep)
            }
        } else {
            stageTile("Asleep", minutes: sleep.asleepMinutes, share: min(Double(sleep.asleepMinutes) / Double(sleep.needMinutes), 1),
                      color: SleepPalette.asleep, note: "Stages need an Apple Watch")
        }
    }

    private func stageTile(_ title: String, minutes: Int, share: Double, color: Color, note: String? = nil) -> some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.subheadline).foregroundStyle(subtle)
                Text(DetailFormat.duration(minutes))
                    .font(.system(size: 24, weight: .semibold, design: .rounded))
                    .foregroundStyle(text)
                Text(note ?? "\(Int((share * 100).rounded()))%")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(color)
            }
            Spacer(minLength: 0)
            MiniRing(progress: share, color: color, size: 30)
        }
        .padding(14)
        .background(SleepPalette.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func goalRow(_ sleep: SleepResult) -> some View {
        let gap = sleep.needMinutes - sleep.asleepMinutes
        let detail = gap > 0 ? "\(DetailFormat.duration(gap)) short" : "Goal met"
        return row(title: "Last night's sleep needed", value: "\(DetailFormat.duration(sleep.needMinutes)) · \(detail)",
                   symbol: "target")
    }

    private func row(title: String, value: String, symbol: String) -> some View {
        HStack {
            Label(title, systemImage: symbol)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(text)
            Spacer()
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(subtle)
        }
        .padding(16)
        .background(SleepPalette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
