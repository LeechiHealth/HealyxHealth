import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// Healyx colors. Light is the main look: a soft sky-tinted canvas, white cards,
/// and one pastel color per kind of metric. Dark mode keeps matching tokens.
enum Theme {
    static let background = Color(light: 0xF3F6F8, dark: 0x0A0F24)
    static let card = Color(light: 0xFFFFFF, dark: 0x141B36)
    static let secondary = Color(light: 0xEEF2F6, dark: 0x1D2546)
    static let foreground = Color(light: 0x111827, dark: 0xEEF2F7)
    static let muted = Color(light: 0x5B6472, dark: 0x9AA5B8)
    static let border = Color(light: 0xE4E9EF, dark: 0x2A3358)
    static let primary = Color(light: 0x1677C9, dark: 0x4FA8EE)
    static let onPrimary = Color(light: 0xFFFFFF, dark: 0x06101D)
    static let warning = Color(light: 0xB86E00, dark: 0xFCBB39)
    static let destructive = Color(light: 0xD7352D, dark: 0xE5564A)

    /// The Healyx logo blue, for decoration (sky, orbs), not for text.
    static let brand = Color(light: 0x2B97DE, dark: 0x4FA8EE)

    // One color per kind of metric, like the rings on the Overview.
    static let green = Color(light: 0x16A065, dark: 0x3DD68C)
    static let indigo = Color(light: 0x6366F1, dark: 0x8B8EFA)
    static let amber = Color(light: 0xD97706, dark: 0xFBBF24)
    static let pink = Color(light: 0xDB2777, dark: 0xF472B6)
    static let teal = Color(light: 0x0D9488, dark: 0x2DD4BF)

    /// The soft wash at the top of every screen.
    static let washTop = Color(light: 0xD3E9FF, dark: 0x1A1F4A)
    static let washMid = Color(light: 0xEAE8FF, dark: 0x10153A)

    static let shadow = Color(light: 0x1B3550, dark: 0x000000)

    // The onboarding sky (the same in light and dark mode).
    static let skyTop = Color(hex: 0x2A8BEA)
    static let skyMid = Color(hex: 0x5DB2F8)
    static let skyLow = Color(hex: 0xA4D8FF)
    static let skyHaze = Color(hex: 0xE4F4FF)
}

extension Color {
    /// A color that follows light/dark mode.
    init(light: UInt32, dark: UInt32) {
        #if os(macOS)
        self.init(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? NSColor(hex: dark) : NSColor(hex: light)
        })
        #else
        self.init(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light)
        })
        #endif
    }

    /// A fixed color that doesn't change with light/dark mode.
    init(hex: UInt32) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: 1)
    }
}

#if os(macOS)
extension NSColor {
    convenience init(hex: UInt32) {
        self.init(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}
#else
extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}
#endif

// MARK: - Reusable styles

struct CardStyle: ViewModifier {
    var padding: CGFloat = 18

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Theme.border.opacity(0.6), lineWidth: 0.5))
            .shadow(color: Theme.shadow.opacity(0.07), radius: 18, x: 0, y: 8)
    }
}

/// The page background. It follows the time of day ("Follows the sun"):
/// a fresh sky by day, warm at sunset, violet at twilight, navy with stars at night.
struct HealyxBackground: View {
    @AppStorage(Appearance.storageKey) private var appearance: Appearance = .circadian
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let part = appearance.daypart(clock: CircadianClock.shared, systemScheme: colorScheme)
        let palette = part.palette
        ZStack(alignment: .top) {
            LinearGradient(stops: [
                .init(color: palette.top, location: 0),
                .init(color: palette.mid, location: 0.28),
                .init(color: palette.bottom, location: 0.6),
            ], startPoint: .top, endPoint: .bottom)

            if part == .night || part == .twilight {
                StarField(opacity: part == .night ? 1 : 0.45)
                Circle()
                    .fill(Color(hex: 0xC9D4FF).opacity(part == .night ? 0.18 : 0.1))
                    .frame(width: 220, height: 220)
                    .blur(radius: 60)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .offset(x: 40, y: 40)
            }
            if part == .sunset || part == .golden {
                Circle()
                    .fill(Color(hex: part == .sunset ? 0xFF8A5C : 0xFFC46B).opacity(0.35))
                    .frame(width: 360, height: 360)
                    .blur(radius: 90)
                    .frame(maxHeight: .infinity, alignment: .bottom)
                    .offset(y: 120)
            }
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 2), value: part)
        .ignoresSafeArea()
    }
}

extension View {
    func card(padding: CGFloat = 18) -> some View { modifier(CardStyle(padding: padding)) }

    /// Small uppercase label above a heading, like the web's "eyebrow" class.
    func eyebrow() -> some View {
        font(.caption.weight(.semibold))
            .textCase(.uppercase)
            .tracking(0.8)
            .foregroundStyle(Theme.muted)
    }

    /// Page background for scrolling screens.
    func healyxBackground() -> some View {
        background { HealyxBackground() }
    }
}

/// The main call to action: a blue pill.
struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .foregroundStyle(Theme.onPrimary)
            .background(Theme.primary.opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.4), in: Capsule())
    }
}

/// White or black pills, for the onboarding screen.
struct PillButtonStyle: ButtonStyle {
    enum Kind { case white, ink }
    var kind: Kind = .white

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .foregroundStyle(kind == .white ? Color(hex: 0x111827) : Color.white)
            .background(kind == .white ? Color.white : Color(hex: 0x111827), in: Capsule())
            .shadow(color: Color.black.opacity(0.12), radius: 12, x: 0, y: 6)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

struct Chip: View {
    let text: String
    var color: Color = Theme.primary

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .foregroundStyle(color)
            .background(color.opacity(0.12), in: Capsule())
    }
}

/// A symbol in a soft colored circle.
struct IconBadge: View {
    let symbol: String
    var color: Color = Theme.primary
    var size: CGFloat = 32

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.45, weight: .semibold))
            .foregroundStyle(color)
            .frame(width: size, height: size)
            .background(color.opacity(0.14), in: Circle())
            .accessibilityHidden(true)
    }
}

struct ErrorBanner: View {
    let message: String
    var onDismiss: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Theme.warning)
            Text(message).font(.footnote).foregroundStyle(Theme.foreground)
            Spacer(minLength: 0)
            if let onDismiss {
                Button(action: onDismiss) { Image(systemName: "xmark").font(.caption) }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.muted)
                    .accessibilityLabel("Dismiss")
            }
        }
        .padding(12)
        .background(Theme.warning.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

// MARK: - Rings

/// A score ring with the value in the middle and a label under it.
/// `progress` is 0...1; nil means there's no data, and the ring stays empty.
struct MetricRing: View {
    let progress: Double?
    let color: Color
    let label: String
    var valueText: String?
    var unit: String?
    var size: CGFloat = 104

    var body: some View {
        VStack(spacing: 10) {
            ZStack {
                MiniRing(progress: progress, color: color, size: size, lineWidth: size * 0.1)
                HStack(alignment: .firstTextBaseline, spacing: 1) {
                    Text(valueText ?? "–")
                        .font(.system(size: size * 0.26, weight: .semibold, design: .rounded).monospacedDigit())
                    if let unit, valueText != nil {
                        Text(unit)
                            .font(.system(size: size * 0.13, weight: .semibold, design: .rounded))
                            .foregroundStyle(Theme.muted)
                    }
                }
                .foregroundStyle(Theme.foreground)
            }
            Text(label)
                .font(.caption.weight(.medium))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(valueText.map { $0 + (unit ?? "") } ?? "no data")")
    }
}

/// Just the ring.
struct MiniRing: View {
    let progress: Double?
    let color: Color
    var size: CGFloat = 28
    var lineWidth: CGFloat?

    var body: some View {
        let width = lineWidth ?? max(3, size * 0.14)
        let value = min(max(progress ?? 0, 0), 1)
        ZStack {
            Circle().stroke(color.opacity(0.15), lineWidth: width)
            if progress != nil {
                Circle()
                    .trim(from: 0, to: max(value, 0.001))
                    .stroke(
                        AngularGradient(colors: [color.opacity(0.55), color], center: .center,
                                        startAngle: .degrees(0), endAngle: .degrees(360 * max(value, 0.01))),
                        style: StrokeStyle(lineWidth: width, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
            }
        }
        .frame(width: size, height: size)
        .padding(width / 2)
    }
}

// MARK: - Orbs

/// Colors for a glossy gradient orb: a highlight, the body, the shaded edge,
/// and a second hue that blends in from the lower right.
struct OrbPalette {
    let light: Color
    let base: Color
    let deep: Color
    let accent: Color

    static let healyx = OrbPalette(light: Color(hex: 0xFFFFFF), base: Color(hex: 0x8CCBFF),
                                   deep: Color(hex: 0x2B8BE0), accent: Color(hex: 0xC4B5FF))
}

/// A soft, glowing gradient sphere. Used for the agents and the onboarding logo.
struct GradientOrb: View {
    let palette: OrbPalette
    var size: CGFloat = 56
    var glow = true

    var body: some View {
        ZStack {
            Circle()
                .fill(RadialGradient(colors: [palette.light, palette.base, palette.deep],
                                     center: UnitPoint(x: 0.36, y: 0.3),
                                     startRadius: 0, endRadius: size * 0.74))
            Circle()
                .fill(RadialGradient(colors: [palette.accent.opacity(0.85), palette.accent.opacity(0)],
                                     center: UnitPoint(x: 0.8, y: 0.88),
                                     startRadius: 0, endRadius: size * 0.62))
            Ellipse()
                .fill(Color.white.opacity(0.6))
                .frame(width: size * 0.42, height: size * 0.24)
                .offset(x: -size * 0.12, y: -size * 0.25)
                .blur(radius: size * 0.06)
            Circle()
                .strokeBorder(LinearGradient(colors: [Color.white.opacity(0.7), Color.white.opacity(0)],
                                             startPoint: .top, endPoint: .center),
                              lineWidth: max(1, size * 0.02))
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .background {
            if glow {
                Circle()
                    .fill(palette.base)
                    .frame(width: size * 0.9, height: size * 0.9)
                    .blur(radius: size * 0.22)
                    .opacity(0.55)
                    .offset(y: size * 0.1)
            }
        }
        .accessibilityHidden(true)
    }
}

/// The Healyx heart inside a glowing orb.
struct HealyxOrb: View {
    var size: CGFloat = 160

    var body: some View {
        ZStack {
            GradientOrb(palette: .healyx, size: size)
            Image("HealyxMarkWhite")
                .resizable()
                .scaledToFit()
                .frame(width: size * 0.5, height: size * 0.5)
                .shadow(color: Color(hex: 0x1B5FA8).opacity(0.35), radius: size * 0.03, y: size * 0.015)
        }
        .accessibilityHidden(true)
    }
}

/// The Healyx dotted-heart mark (blue in light mode, white in dark mode).
struct HealyxMark: View {
    var size: CGFloat = 36

    var body: some View {
        Image("HealyxMark")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

enum Clipboard {
    static func copy(_ text: String) {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #else
        UIPasteboard.general.string = text
        #endif
    }
}

/// Renders inline Markdown (bold, italics, links) while keeping line breaks.
func markdown(_ text: String) -> AttributedString {
    let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
    return (try? AttributedString(markdown: text, options: options)) ?? AttributedString(text)
}
