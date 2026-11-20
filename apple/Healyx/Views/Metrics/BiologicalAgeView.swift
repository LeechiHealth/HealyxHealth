import SwiftUI
import HealyxKit

/// Biological age from bloodwork (PhenoAge), the markers it used, and how much to
/// trust it.
struct BiologicalAgeView: View {
    @Environment(WellnessStore.self) private var wellness
    @Environment(RecordsStore.self) private var records

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let result = wellness.biologicalAge {
                    hero(result)
                    markerList(result)
                    confidence(result)
                } else {
                    DetailEmptyState(symbol: "heart.text.square.fill", title: "Add bloodwork to see your biological age",
                                     detail: "Biological age uses nine common lab results (from a CMP, CBC and CRP) plus your date of birth. Add a lab report in Health Records.")
                }
                Text("An estimate from the PhenoAge formula (Levine et al., 2018), which links routine blood markers to aging research in large population studies. It isn't a diagnosis, and a single result can move with illness, hydration or lab differences.")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
            .padding(20)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .healyxBackground()
        .navigationTitle("Biological Age")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task(id: records.biomarkers.count) { wellness.updateBiologicalAge(records: records) }
        .refreshable {
            await records.reload()
            wellness.updateBiologicalAge(records: records)
        }
    }

    @ViewBuilder private func hero(_ result: BiologicalAgeResult) -> some View {
        VStack(spacing: 10) {
            Text(result.labDate.flatMap { HealyxDate.displayDay($0) }.map { "As of \($0)" } ?? "From your labs")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Theme.muted)
            if let age = result.age {
                Text(DetailFormat.number(age, decimals: 1))
                    .font(.system(size: 64, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(Theme.foreground)
                if let difference = result.difference {
                    let younger = difference < 0
                    Text(abs(difference) < 0.1 ? "Right at your calendar age"
                         : "\(DetailFormat.number(abs(difference), decimals: 1)) years \(younger ? "younger" : "older")")
                        .font(.headline)
                        .foregroundStyle(younger ? Theme.green : Theme.amber)
                }
                if let chronological = result.chronologicalAge {
                    Text("Calendar age \(DetailFormat.number(chronological, decimals: 1))")
                        .font(.footnote)
                        .foregroundStyle(Theme.muted)
                }
            } else {
                Image(systemName: "heart.text.square")
                    .font(.system(size: 44))
                    .foregroundStyle(Theme.teal)
                Text(heroMessage(result))
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.foreground)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 26)
        .padding(.horizontal, 18)
        .background(
            LinearGradient(colors: [Theme.teal.opacity(0.16), Theme.washTop.opacity(0.5), Theme.card.opacity(0)],
                           startPoint: .top, endPoint: .bottom),
            in: RoundedRectangle(cornerRadius: 28, style: .continuous)
        )
    }

    private func heroMessage(_ result: BiologicalAgeResult) -> String {
        var needs: [String] = []
        if !result.missing.isEmpty {
            needs.append("\(result.missing.count) more lab \(result.missing.count == 1 ? "result" : "results")")
        }
        if result.needsDateOfBirth { needs.append("your date of birth in your Healyx profile") }
        return "To calculate this, Healyx needs " + needs.joined(separator: " and ") + "."
    }

    private func markerList(_ result: BiologicalAgeResult) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Markers used").font(.headline).foregroundStyle(Theme.foreground)
            ForEach(result.markers) { marker in
                HStack {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.green)
                    Text(marker.label).font(.subheadline).foregroundStyle(Theme.foreground)
                    Spacer()
                    VStack(alignment: .trailing, spacing: 1) {
                        Text("\(jsNumberString(marker.value)) \(marker.unit ?? "")")
                            .font(.subheadline.weight(.semibold).monospacedDigit())
                            .foregroundStyle(Theme.foreground)
                        if let date = marker.testDate.flatMap({ HealyxDate.displayDay($0) }) {
                            Text(date).font(.caption2).foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
            ForEach(result.missing, id: \.self) { label in
                HStack {
                    Image(systemName: "circle.dashed").foregroundStyle(Theme.muted)
                    Text(label).font(.subheadline).foregroundStyle(Theme.muted)
                    Spacer()
                    Text("Not on file").font(.caption).foregroundStyle(Theme.muted)
                }
            }
        }
        .card()
    }

    private func confidence(_ result: BiologicalAgeResult) -> some View {
        let (symbol, color, text) = confidenceText(result)
        return Label {
            Text(text).font(.subheadline).foregroundStyle(Theme.foreground)
        } icon: {
            Image(systemName: symbol).foregroundStyle(color)
        }
        .card()
    }

    private func confidenceText(_ result: BiologicalAgeResult) -> (String, Color, String) {
        guard result.age != nil else {
            return ("info.circle.fill", Theme.primary, "\(result.markers.count) of 9 markers on file.")
        }
        let dates = Set(result.markers.compactMap { $0.testDate.map { String($0.prefix(10)) } })
        if let newest = result.labDate.flatMap({ HealyxDate.utcDay(String($0.prefix(10))) }),
           Date().timeIntervalSince(newest) > 365 * 86_400 {
            return ("exclamationmark.triangle.fill", Theme.warning,
                    "Your newest labs are over a year old, so this may not reflect you today.")
        }
        if dates.count > 1 {
            return ("checkmark.seal.fill", Theme.teal,
                    "All 9 markers are on file, from \(dates.count) different lab dates. Results drawn on the same day give the most reliable estimate.")
        }
        return ("checkmark.seal.fill", Theme.green, "All 9 markers are on file from the same lab draw.")
    }
}
