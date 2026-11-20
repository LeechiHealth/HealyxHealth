import SwiftUI
import HealyxKit

/// Today's food from Apple Health: the macro split, calories against energy burned,
/// fiber and water.
struct NutritionDetailView: View {
    @Environment(WellnessStore.self) private var wellness

    private let fatColor = Color(hex: 0x5B8CFF)
    private let carbsColor = Color(hex: 0xF59E0B)
    private let proteinColor = Color(hex: 0xEC4899)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let nutrition = wellness.snapshot?.nutrition {
                    macros(nutrition)
                    energy(nutrition)
                    extras(nutrition)
                    if let score = nutrition.score {
                        HStack {
                            Label("Nutrition score", systemImage: "fork.knife")
                                .font(.subheadline.weight(.medium))
                            Spacer()
                            Text("\(score)").font(.headline.monospacedDigit())
                        }
                        .foregroundStyle(Theme.foreground)
                        .card()
                        Text("The score checks today's split against common adult ranges (protein 10 to 35%, carbs 45 to 65%, fat 20 to 35% of calories) and fiber toward 28 g.")
                            .font(.caption)
                            .foregroundStyle(Theme.muted)
                    }
                } else {
                    DetailEmptyState(symbol: "fork.knife", title: "No meals logged today",
                                     detail: "Log meals in an app that saves to Apple Health (like MyFitnessPal or Cronometer) and your breakdown shows here.")
                }
                ManualLogSection(kinds: [.meal, .water])
                DetailFootnote()
            }
            .padding(20)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .healyxBackground()
        .navigationTitle("Nutrition")
        .toolbar {
            ToolbarItem(placement: .primaryAction) { LogMenu(kinds: [.meal, .water]) }
        }
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .refreshable { await wellness.refresh() }
    }

    private func macros(_ nutrition: NutritionResult) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Nutritional details").font(.headline).foregroundStyle(Theme.foreground)
            if let fat = nutrition.fatPct, let carbs = nutrition.carbsPct, let protein = nutrition.proteinPct {
                HStack(alignment: .bottom, spacing: 14) {
                    column(percent: fat, label: "Fat", color: fatColor)
                    column(percent: carbs, label: "Carbs", color: carbsColor)
                    column(percent: protein, label: "Protein", color: proteinColor)
                }
            } else {
                Text("Your food log has calories but no macro breakdown yet.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
            }
        }
        .card()
    }

    /// A column of dots, filled from the bottom by the percent.
    private func column(percent: Int, label: String, color: Color) -> some View {
        let columns = 6, rows = 10
        let filled = Int((Double(percent) / 100 * Double(columns * rows)).rounded())
        return VStack(alignment: .leading, spacing: 8) {
            VStack(spacing: 4) {
                ForEach(0..<rows, id: \.self) { row in
                    HStack(spacing: 4) {
                        ForEach(0..<columns, id: \.self) { col in
                            let index = (rows - 1 - row) * columns + col
                            Circle()
                                .fill(index < filled ? color : color.opacity(0.12))
                                .frame(width: 6, height: 6)
                        }
                    }
                }
            }
            Text("\(percent)%")
                .font(.system(size: 22, weight: .semibold, design: .rounded))
                .foregroundStyle(Theme.foreground)
            Text(label).font(.footnote.weight(.semibold)).foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label) \(percent) percent of calories")
    }

    private func energy(_ nutrition: NutritionResult) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(DetailFormat.number(nutrition.energyKcal)) kcal")
                        .font(.title2.weight(.semibold).monospacedDigit())
                        .foregroundStyle(Theme.foreground)
                    Text("Logged today").font(.caption).foregroundStyle(Theme.muted)
                }
                Spacer()
                if let net = nutrition.netKcal {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(net > 0 ? "+" : "")\(DetailFormat.number(net)) kcal")
                            .font(.headline.monospacedDigit())
                            .foregroundStyle(Theme.foreground)
                        Text("Net energy").font(.caption).foregroundStyle(Theme.muted)
                    }
                }
            }
            if let net = nutrition.netKcal {
                let burned = (nutrition.activeKcal ?? 0) + (nutrition.basalKcal ?? 0)
                netBar(net)
                HStack(spacing: 14) {
                    Label("\(DetailFormat.number(nutrition.energyKcal)) eaten", systemImage: "fork.knife")
                    Label("\(DetailFormat.number(burned)) burned", systemImage: "flame.fill")
                }
                .font(.caption.weight(.medium))
                .foregroundStyle(Theme.muted)
                Text("Burned so far today, including your resting energy. Net energy usually ends the day lower than it looks in the morning.")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
        }
        .card()
    }

    /// A bar from -500 to +500 kcal with a marker at today's net.
    private func netBar(_ net: Double) -> some View {
        let clamped = min(max(net, -500), 500)
        return VStack(spacing: 4) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(LinearGradient(colors: [Color(hex: 0xF97316), Color(hex: 0xFBBF24), Color(hex: 0x6366F1)],
                                             startPoint: .leading, endPoint: .trailing))
                        .frame(height: 8)
                    Circle()
                        .fill(Color.white)
                        .overlay(Circle().strokeBorder(Theme.foreground.opacity(0.4), lineWidth: 1.5))
                        .frame(width: 14, height: 14)
                        .offset(x: CGFloat((clamped + 500) / 1000) * (geo.size.width - 14))
                }
                .frame(maxHeight: .infinity)
            }
            .frame(height: 16)
            HStack {
                Text("-500"); Spacer(); Text("0"); Spacer(); Text("+500")
            }
            .font(.caption2.monospacedDigit())
            .foregroundStyle(Theme.muted)
        }
    }

    private func extras(_ nutrition: NutritionResult) -> some View {
        HStack(spacing: 12) {
            DetailTile(title: "Fiber", symbol: "leaf.fill",
                       value: nutrition.fiberG.map { DetailFormat.number($0) } ?? "–", unit: "g",
                       footnote: "Aim for about 28 g")
            DetailTile(title: "Water", symbol: "drop.fill",
                       value: nutrition.waterML.map { DetailFormat.number($0 / 29.5735) } ?? "–", unit: "fl oz",
                       footnote: "Logged today")
        }
    }
}
