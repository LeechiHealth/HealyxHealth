import SwiftUI
import HealyxKit

/// One biological age: PhenoAge when all nine labs are on file, otherwise the
/// Klemera-Doubal method on whatever markers are available.
struct BiologicalAgeView: View {
    @Environment(WellnessStore.self) private var wellness
    @Environment(RecordsStore.self) private var records

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let result = wellness.biologicalAge {
                    hero(result)
                    confidence(result)
                    markerList(result)
                    if !result.missing.isEmpty { upgradeCard(result) }
                } else {
                    DetailEmptyState(symbol: "heart.text.square.fill", title: "Add bloodwork to see your biological age",
                                     detail: "Healyx needs a few routine lab results (a metabolic panel, CBC or A1c) and your date of birth. Add a lab report in Health Records.")
                }
                Text(footnote)
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

    private var footnote: String {
        switch wellness.biologicalAge?.method {
        case .kdm?:
            return "Estimated with the Klemera-Doubal method, trained on about 10,000 US adults in NHANES III (BioAge, Kwon and Belsky 2021). It compares each result with how that marker typically changes with age. With all nine PhenoAge labs, Healyx switches to PhenoAge, which is more strongly linked to long-term health outcomes. It's an estimate from population research and can move with illness, hydration or lab differences."
        default:
            return "Estimated with PhenoAge (Levine et al. 2018), built from routine blood markers in about 10,000 US adults and validated in a second national sample. It's an estimate from population research and can move with illness, hydration or lab differences."
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
                if let method = result.method {
                    Chip(text: method.name, color: Theme.teal)
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
        if result.needsDateOfBirth { return "Add your date of birth in your Healyx profile to see your biological age." }
        if result.needsSex { return "Add your sex (male or female) in your Healyx profile. The formula is calibrated separately for men and women." }
        let found = result.markers.count
        if found < KDM.minimumMarkers {
            return "Healyx needs at least \(KDM.minimumMarkers) routine lab results to estimate this. You have \(found) on file."
        }
        return "These results aren't enough for a reliable estimate yet. Adding a CBC or metabolic panel will usually do it."
    }

    private func markerList(_ result: BiologicalAgeResult) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(result.age == nil ? "Found so far" : "Markers used").font(.headline).foregroundStyle(Theme.foreground)
            if result.markers.isEmpty {
                Text("No matching results yet.").font(.subheadline).foregroundStyle(Theme.muted)
            }
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
        }
        .card()
    }

    /// The PhenoAge labs still missing, as the path to the most validated estimate.
    private func upgradeCard(_ result: BiologicalAgeResult) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("For the most accurate estimate").font(.headline).foregroundStyle(Theme.foreground)
            Text("Add these to use PhenoAge. Most come from a CMP, a CBC with differential and an hs-CRP, often in one blood draw.")
                .font(.footnote).foregroundStyle(Theme.muted)
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
        guard result.age != nil, let level = result.confidence else {
            return ("info.circle.fill", Theme.primary, "\(result.markers.count) usable results on file.")
        }
        if let newest = result.labDate.flatMap({ HealyxDate.utcDay(String($0.prefix(10))) }),
           Date().timeIntervalSince(newest) > 365 * 86_400 {
            return ("exclamationmark.triangle.fill", Theme.warning,
                    "Confidence: \(level.label). Your newest labs are over a year old, so this may not reflect you today.")
        }
        switch result.method {
        case .phenoAge?:
            let dates = Set(result.markers.compactMap { $0.testDate.map { String($0.prefix(10)) } })
            let draw = dates.count > 1 ? "from \(dates.count) lab dates" : "from one blood draw"
            return ("checkmark.seal.fill", Theme.green, "Confidence: High. All 9 PhenoAge markers are on file, \(draw).")
        default:
            let spread = result.typicalSpread.map { " Estimates from this set of \(result.markers.count) markers typically land within about \(Int($0.rounded())) years of calendar age." } ?? ""
            return ("checkmark.seal", level == .moderate ? Theme.teal : Theme.warning,
                    "Confidence: \(level.label).\(spread)")
        }
    }
}
