import SwiftUI

extension View {
    /// Liquid glass on iOS 26 / macOS 26, frosted material before that.
    @ViewBuilder
    func liquidGlass<S: Shape>(in shape: S) -> some View {
        if #available(iOS 26.0, macOS 26.0, *) {
            self.glassEffect(.regular.interactive(), in: shape)
        } else {
            self
                .background(.ultraThinMaterial, in: shape)
                .overlay(shape.stroke(Color.white.opacity(0.5), lineWidth: 0.5))
                .shadow(color: Theme.shadow.opacity(0.14), radius: 16, x: 0, y: 8)
        }
    }
}

/// The floating bottom bar on iPhone: a round Home button and an "Ask Healyx" pill, then Records and Agents.
struct GlassBar: View {
    @Environment(AppRouter.self) private var router

    var body: some View {
        HStack(spacing: 10) {
            circleButton("house.fill", "Home", .home)

            Button { router.section = .guide } label: {
                HStack(spacing: 10) {
                    HealyxBuddy(size: 22, mood: .idle)
                    Text("Ask Healyx")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Theme.foreground)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .contentShape(Capsule())
                .liquidGlass(in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Ask Healyx")

            circleButton(AppSection.records.symbol, "Health Records", .records)
            circleButton(AppSection.agents.symbol, "Agents", .agents)
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .padding(.bottom, 6)
    }

    /// A small round liquid-glass button that switches section.
    private func circleButton(_ symbol: String, _ label: String, _ section: AppSection) -> some View {
        Button { router.section = section } label: {
            Image(systemName: symbol)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(router.section == section ? Theme.primary : Theme.foreground)
                .frame(width: 54, height: 54)
                .contentShape(Circle())
                .liquidGlass(in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// A small round glass Home button, shown over the chat instead of the full bar.
struct GlassHomeButton: View {
    @Environment(AppRouter.self) private var router

    var body: some View {
        Button { router.section = .home } label: {
            Image(systemName: "house.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.foreground)
                .frame(width: 44, height: 44)
                .contentShape(Circle())
                .liquidGlass(in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Home")
    }
}
