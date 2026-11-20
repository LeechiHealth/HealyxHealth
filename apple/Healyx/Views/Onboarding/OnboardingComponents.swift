import SwiftUI

/// Shared layout for one onboarding step: back button, centered title and
/// subtitle, content in the middle, and a black Continue pill at the bottom.
struct OnboardingPage<Content: View>: View {
    let title: String
    var subtitle: String?
    var onBack: (() -> Void)?
    var primaryTitle = "Continue"
    var primaryEnabled = true
    var primaryBusy = false
    let onPrimary: () -> Void
    var secondaryTitle: String?
    var onSecondary: (() -> Void)?
    var titleOnTop = true
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                if let onBack {
                    OnboardingBackButton(action: onBack)
                }
                Spacer()
            }
            .frame(height: 56)
            .padding(.horizontal, 20)

            if titleOnTop {
                header.padding(.top, 24)
                Spacer(minLength: 16)
                content()
                Spacer(minLength: 16)
            } else {
                Spacer(minLength: 16)
                content()
                header.padding(.top, 24)
                Spacer(minLength: 16)
            }

            VStack(spacing: 14) {
                Button(action: onPrimary) {
                    if primaryBusy {
                        ProgressView().tint(.white)
                    } else {
                        Text(primaryTitle)
                    }
                }
                .buttonStyle(PillButtonStyle(kind: .ink))
                .disabled(!primaryEnabled || primaryBusy)
                .opacity(primaryEnabled ? 1 : 0.5)

                if let secondaryTitle, let onSecondary {
                    Button(secondaryTitle, action: onSecondary)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Theme.muted)
                        .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 16)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background.ignoresSafeArea())
    }

    @ViewBuilder private var header: some View {
        VStack(spacing: 12) {
            Text(title)
                .font(.system(size: 30, weight: .semibold))
                .tracking(-0.5)
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.foreground)
            if let subtitle {
                Text(subtitle)
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.horizontal, 28)
    }
}

struct OnboardingBackButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "chevron.left")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(Theme.foreground)
                .frame(width: 52, height: 52)
                .background(Theme.card, in: Circle())
                .shadow(color: Theme.shadow.opacity(0.1), radius: 14, x: 0, y: 6)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Back")
    }
}

/// A big, soft, 3D-looking tile with a symbol, for the onboarding art.
struct SoftSymbolTile: View {
    let symbol: String
    var colors: [Color] = [Color(hex: 0x7CC4FF), Color(hex: 0x2B7FD8)]
    var size: CGFloat = 220

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.26, style: .continuous)
                .fill(LinearGradient(colors: [Color.white, Color(hex: 0xE6EBF1)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
                .shadow(color: Theme.shadow.opacity(0.18), radius: size * 0.12, x: 0, y: size * 0.08)
            RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
                .fill(LinearGradient(colors: [Color(hex: 0xF7F9FC), Color(hex: 0xDDE3EA)],
                                     startPoint: .top, endPoint: .bottom))
                .padding(size * 0.06)
                .shadow(color: Color.white.opacity(0.9), radius: 2, x: -2, y: -2)
            Image(systemName: symbol)
                .font(.system(size: size * 0.36, weight: .regular))
                .foregroundStyle(LinearGradient(colors: colors, startPoint: .top, endPoint: .bottom))
                .shadow(color: colors.last!.opacity(0.3), radius: size * 0.04, x: 0, y: size * 0.03)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Page dots for the intro pager.
struct PageDots: View {
    let count: Int
    let index: Int
    var activeColor: Color = Theme.foreground

    var body: some View {
        HStack(spacing: 8) {
            ForEach(0..<count, id: \.self) { i in
                Circle()
                    .fill(i == index ? activeColor : activeColor.opacity(0.25))
                    .frame(width: 8, height: 8)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Page \(index + 1) of \(count)")
    }
}

/// A white rounded row with a chevron.
struct OnboardingRow: View {
    let title: String
    var detail: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.title3.weight(.semibold)).foregroundStyle(Theme.foreground)
                    if let detail {
                        Text(detail).font(.footnote).foregroundStyle(Theme.muted)
                    }
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 22)
            .padding(.vertical, 20)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: Theme.shadow.opacity(0.06), radius: 10, x: 0, y: 4)
            .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

/// A selectable card with a radio circle (units).
struct OnboardingChoiceCard: View {
    let title: String
    let detail: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(.title3.weight(.semibold)).foregroundStyle(Theme.foreground)
                    Text(detail).font(.subheadline).foregroundStyle(Theme.foreground.opacity(0.8))
                }
                Spacer()
                ZStack {
                    Circle().strokeBorder(selected ? Theme.foreground : Theme.border, lineWidth: selected ? 7 : 1.5)
                }
                .frame(width: 26, height: 26)
            }
            .padding(22)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(selected ? Theme.foreground : Color.clear, lineWidth: 1.5)
            )
            .shadow(color: Theme.shadow.opacity(0.06), radius: 10, x: 0, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
