import SwiftUI

/// Healyx's own orb character: a glossy blue orb with a face drawn from the
/// dotted-heart logo. Round eyes that blink
/// that pulse while it thinks or talks. The glow breathes while it listens.
struct HealyxBuddy: View {
    enum Mood: Equatable { case idle, listening, thinking, speaking }

    var size: CGFloat = 96
    var mood: Mood = .idle
    /// Small avatars next to messages stay still to save battery.
    var animated = true

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var moving: Bool { animated && !reduceMotion }

    static let palette = OrbPalette(light: Color(hex: 0xF4F8FF), base: Color(hex: 0x9CC6FF),
                                    deep: Color(hex: 0x4F7BEA), accent: Color(hex: 0xC8B4FF))
    private let ink = Color(hex: 0x1C3266)

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !moving)) { context in
            let time = moving ? context.date.timeIntervalSinceReferenceDate : 0
            ZStack {
                glow(time)
                GradientOrb(palette: Self.palette, size: size, glow: false)
                face(time)
            }
            .frame(width: size, height: size)
            .offset(y: !moving ? 0 : CGFloat(sin(time * 1.1)) * size * 0.03)
        }
        .frame(width: size * 1.3, height: size * 1.3)
        .accessibilityElement()
        .accessibilityLabel(accessibilityText)
    }

    // MARK: Pieces

    private func glow(_ time: Double) -> some View {
        let breathing = mood == .listening ? 0.12 * (1 + sin(time * 3)) / 2 : 0
        return Circle()
            .fill(RadialGradient(colors: [Self.palette.base.opacity(0.7), Self.palette.accent.opacity(0.35), .clear],
                                 center: .center, startRadius: size * 0.2, endRadius: size * 0.75))
            .frame(width: size * 1.3, height: size * 1.3)
            .scaleEffect(1 + breathing)
            .blur(radius: size * 0.08)
    }

    private func face(_ time: Double) -> some View {
        let eye = size * 0.12
        let blink = isBlinking(time) ? 0.12 : 1.0
        let look: CGFloat = mood == .thinking ? -size * 0.04 : 0
        let pulse = mouthScale(time, index: 0)
        return HStack(spacing: size * 0.2) {
            eyeView(diameter: eye).scaleEffect(x: 1, y: blink)
            eyeView(diameter: eye).scaleEffect(x: 1, y: blink)
        }
        .scaleEffect(pulse)
        .offset(y: look)
        .offset(y: size * 0.04)
    }

    private func eyeView(diameter: CGFloat) -> some View {
        Circle()
            .fill(ink)
            .frame(width: diameter, height: diameter)
            .overlay(alignment: .topLeading) {
                Circle()
                    .fill(Color.white.opacity(0.9))
                    .frame(width: diameter * 0.32, height: diameter * 0.32)
                    .offset(x: diameter * 0.18, y: diameter * 0.16)
            }
    }

    // MARK: Motion

    /// A quick blink every few seconds.
    private func isBlinking(_ time: Double) -> Bool {
        guard moving else { return false }
        return time.truncatingRemainder(dividingBy: 4.2) < 0.14
    }

    private func mouthScale(_ time: Double, index: Int) -> CGFloat {
        guard moving else { return 1 }
        switch mood {
        case .speaking:
            return 1 + 0.06 * CGFloat(abs(sin(time * 5)))
        case .thinking:
            return 1
        case .idle, .listening:
            return 1
        }
    }

    private var accessibilityText: String {
        switch mood {
        case .idle: return "Healyx"
        case .listening: return "Healyx is listening"
        case .thinking: return "Healyx is thinking"
        case .speaking: return "Healyx is speaking"
        }
    }
}
