import SwiftUI
import HealyxKit

/// Small pieces shared by the stress, recovery, sleep, nutrition and biological age screens.
enum DetailFormat {
    static func duration(_ minutes: Int) -> String { WellnessSummary.duration(minutes) }

    static func number(_ value: Double, decimals: Int = 0) -> String {
        value.formatted(.number.precision(.fractionLength(decimals)))
    }

    static func time(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }

    static func day(_ date: Date) -> String {
        date.formatted(.dateTime.month(.wide).day().year())
    }
}

enum SleepPalette {
    static let navy = Color(hex: 0x141B3A)
    static let card = Color(hex: 0x1E2750)
    static let awake = Color(hex: 0xFF9F5A)
    static let rem = Color(hex: 0x7CC4FF)
    static let core = Color(hex: 0x3D7BFF)
    static let deep = Color(hex: 0x8E6CFF)
    static let asleep = Color(hex: 0x5B8CFF)

    static func color(_ stage: SleepStage) -> Color {
        switch stage {
        case .awake, .inBed: return awake
        case .rem: return rem
        case .core: return core
        case .deep: return deep
        case .unspecified: return asleep
        }
    }
}

/// A rounded tile with a label, a big value and an optional trend arrow.
struct DetailTile: View {
    let title: String
    let symbol: String
    let value: String
    var unit: String?
    /// Up is true, down is false, nil hides the arrow.
    var trendUp: Bool?
    var trendColor: Color = Theme.muted
    var footnote: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: symbol)
                .font(.caption.weight(.medium))
                .foregroundStyle(Theme.muted)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(value)
                    .font(.system(size: 28, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(Theme.foreground)
                if let unit {
                    Text(unit).font(.subheadline).foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 0)
                if let trendUp {
                    Image(systemName: trendUp ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill")
                        .font(.caption)
                        .foregroundStyle(trendColor)
                }
            }
            if let footnote {
                Text(footnote).font(.caption).foregroundStyle(Theme.muted)
            }
        }
        .card(padding: 14)
    }
}

/// What to do when a screen has no data yet.
struct DetailEmptyState: View {
    let symbol: String
    let title: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            IconBadge(symbol: symbol, color: Theme.primary, size: 36)
            Text(title).font(.headline).foregroundStyle(Theme.foreground)
            Text(detail).font(.subheadline).foregroundStyle(Theme.muted)
        }
        .card()
    }
}

/// The honest note under every score.
struct DetailFootnote: View {
    var text = "Healyx estimates from Apple Health, not medical measurements."

    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(Theme.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A row of pill buttons, one selected.
struct DetailChips<Option: Hashable & Identifiable>: View {
    let options: [Option]
    let title: (Option) -> String
    @Binding var selection: Option

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(options) { option in
                    let selected = option == selection
                    Button {
                        withAnimation(.snappy) { selection = option }
                    } label: {
                        Text(title(option))
                            .font(.footnote.weight(.semibold))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .foregroundStyle(selected ? Theme.card : Theme.foreground)
                            .background(selected ? Theme.foreground : Theme.secondary, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

/// The close button at the top left of a sheet.
struct DetailCloseButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Theme.foreground)
                .frame(width: 36, height: 36)
                .background(Theme.secondary, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Close")
    }
}
