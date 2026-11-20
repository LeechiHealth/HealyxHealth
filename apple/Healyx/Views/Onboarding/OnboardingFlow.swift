import SwiftUI
import HealyxKit

/// First-run onboarding, shown once after sign-in while `onboarding.done.v1` is false.
/// iPhone gets the full step-by-step flow; the Mac gets one compact welcome page.
struct OnboardingFlow: View {
    let onFinish: () -> Void

    @Environment(SessionStore.self) private var session
    @AppStorage(OnboardingStore.doneKey) private var done = false
    @State private var store = OnboardingStore()

    var body: some View {
        Group {
            #if os(iOS)
            OnboardingSteps(store: store, finish: finish)
            #else
            MacWelcome(store: store, finish: finish)
            #endif
        }
        .onAppear {
            if store.firstName.isEmpty, let name = session.firstName { store.firstName = name }
        }
    }

    private func finish() {
        store.markDone()
        done = true
        onFinish()
    }
}

#if os(iOS)
/// Set when the Apple Health connection finishes.
private final class DoneFlag {
    var done = false
}

private enum Step: Hashable {
    case intro, privacy, name, greeting, wearable, fitbit, health, reading, connected
    case units, notifications, location, setup, personalizing
}

private struct OnboardingSteps: View {
    @Bindable var store: OnboardingStore
    let finish: () -> Void

    @Environment(WellnessStore.self) private var wellness
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var step: Step = .intro
    @State private var history: [Step] = []
    @State private var goingBack = false
    @State private var introPage = 0
    @State private var readProgress: Double = 0
    @FocusState private var nameFocused: Bool

    var body: some View {
        ZStack {
            content
                .id(step)
                .transition(transition)
        }
        .animation(reduceMotion ? .easeInOut(duration: 0.2) : .spring(response: 0.45, dampingFraction: 0.9), value: step)
    }

    private var transition: AnyTransition {
        if reduceMotion { return .opacity }
        return .asymmetric(
            insertion: .move(edge: goingBack ? .leading : .trailing).combined(with: .opacity),
            removal: .move(edge: goingBack ? .trailing : .leading).combined(with: .opacity)
        )
    }

    private func go(_ next: Step) {
        goingBack = false
        history.append(step)
        step = next
    }

    private func back() {
        guard let previous = history.popLast() else { return }
        goingBack = true
        step = previous
    }

    @ViewBuilder private var content: some View {
        switch step {
        case .intro: intro
        case .privacy: privacy
        case .name: name
        case .greeting: greeting
        case .wearable: wearablePicker
        case .fitbit: fitbit
        case .health: health
        case .reading: reading
        case .connected: connected
        case .units: units
        case .notifications: notifications
        case .location: location
        case .setup: setup
        case .personalizing: personalizing
        }
    }

    // MARK: 1. Intro pager

    private var intro: some View {
        ZStack {
            if introPage == 0 {
                SkyBackground().transition(.opacity)
            } else {
                Theme.background.ignoresSafeArea().transition(.opacity)
            }

            VStack(spacing: 0) {
                TabView(selection: $introPage) {
                    introSlide(
                        art: AnyView(HealyxOrb(size: 180)),
                        title: "Meet Healyx",
                        subtitle: "Your labs, meds, sleep and the to-dos in between, in one calm place.",
                        light: true
                    ).tag(0)
                    introSlide(
                        art: AnyView(SoftSymbolTile(symbol: "doc.text.magnifyingglass")),
                        title: "Your records, finally readable",
                        subtitle: "See which results are in range, what changed, and ask the guide what it means in plain words.",
                        light: false
                    ).tag(1)
                    introSlide(
                        art: AnyView(agentRow),
                        title: "Agents that handle the follow-through",
                        subtitle: "Appointments, refills, research and shopping lists, drafted for you to review.",
                        light: false
                    ).tag(2)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                PageDots(count: 3, index: introPage, activeColor: introPage == 0 ? .white : Theme.foreground)
                    .padding(.bottom, 24)

                Button(introPage < 2 ? "Continue" : "Get started") {
                    if introPage < 2 {
                        withAnimation { introPage += 1 }
                    } else {
                        go(.privacy)
                    }
                }
                .buttonStyle(PillButtonStyle(kind: .ink))
                .padding(.horizontal, 24)
                .padding(.bottom, 16)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: introPage)
    }

    private func introSlide(art: AnyView, title: String, subtitle: String, light: Bool) -> some View {
        VStack(spacing: 28) {
            Spacer()
            art
            VStack(spacing: 12) {
                Text(title)
                    .font(.system(size: 34, weight: .semibold))
                    .tracking(-0.6)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(light ? Color.white : Theme.foreground)
                    .shadow(color: light ? Color(hex: 0x0B3D73).opacity(0.3) : .clear, radius: 8, y: 2)
                Text(subtitle)
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(light ? Color.white.opacity(0.92) : Theme.muted)
            }
            .padding(.horizontal, 32)
            Spacer()
        }
    }

    private var agentRow: some View {
        HStack(spacing: 14) {
            ForEach(AgentID.allCases) { agent in
                AgentAvatar(agent: agent, size: 62)
            }
        }
        .padding(.vertical, 40)
    }

    // MARK: 2. Privacy

    private var privacy: some View {
        OnboardingPage(
            title: "Your health, your account",
            subtitle: "Healyx never sells your data. Your records live in your own account, and row-level security keeps every row readable by you alone.",
            onBack: back,
            onPrimary: { go(.name) }
        ) {
            VStack(spacing: 28) {
                SoftSymbolTile(symbol: "lock.shield.fill", colors: [Color(hex: 0x9ED8FF), Color(hex: 0x2B7FD8)])
                Text("Apple Health data is read on your iPhone. Only your daily scores sync to your account so your Mac can show them.")
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.muted)
                    .padding(.horizontal, 36)
            }
        }
    }

    // MARK: 3. First name

    private var trimmedName: String { store.firstName.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var name: some View {
        OnboardingPage(
            title: "What's your first name?",
            onBack: back,
            primaryEnabled: !trimmedName.isEmpty,
            primaryBusy: store.isSavingName,
            onPrimary: {
                nameFocused = false
                Task {
                    await store.saveFirstName()
                    go(.greeting)
                }
            },
            titleOnTop: false
        ) {
            VStack(spacing: 10) {
                TextField("First name", text: $store.firstName)
                    .font(.system(size: 40, weight: .semibold))
                    .multilineTextAlignment(.center)
                    .textContentType(.givenName)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .focused($nameFocused)
                    .submitLabel(.continue)
                Divider().padding(.horizontal, 40)
                if let error = store.nameError {
                    Text(error).font(.footnote).foregroundStyle(Theme.warning)
                }
            }
            .padding(.horizontal, 24)
            .onAppear { nameFocused = true }
        }
    }

    // MARK: 4. Greeting

    private var greeting: some View {
        OnboardingPage(
            title: "Nice to meet you, \(trimmedName.isEmpty ? "there" : trimmedName)!",
            subtitle: "Healyx is your health guide for labs, sleep, recovery and the to-dos in between.",
            onBack: back,
            onPrimary: { go(.wearable) },
            titleOnTop: false
        ) {
            Image(systemName: "hand.wave.fill")
                .font(.system(size: 64))
                .foregroundStyle(LinearGradient(colors: [Color(hex: 0xFFE3A3), Color(hex: 0xF5B94A)],
                                                startPoint: .top, endPoint: .bottom))
                .shadow(color: Color(hex: 0xF5B94A).opacity(0.35), radius: 10, y: 4)
                .accessibilityHidden(true)
        }
    }

    // MARK: 5. Wearable

    private var wearablePicker: some View {
        VStack(spacing: 0) {
            HStack {
                OnboardingBackButton(action: back)
                Spacer()
            }
            .frame(height: 56)
            .padding(.horizontal, 20)

            ScrollView {
                VStack(spacing: 14) {
                    VStack(spacing: 12) {
                        Text("Which wearable do you use?")
                            .font(.system(size: 30, weight: .semibold))
                            .tracking(-0.5)
                            .multilineTextAlignment(.center)
                        Text("Pick one to start. You can connect more later.")
                            .font(.body)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(Theme.muted)
                    }
                    .padding(.horizontal, 28)
                    .padding(.vertical, 24)

                    ForEach(WearableChoice.allCases) { choice in
                        OnboardingRow(title: choice.title, detail: detail(for: choice)) {
                            store.wearable = choice
                            switch choice {
                            case .fitbit: go(.fitbit)
                            case .none: go(.units)
                            default: go(wellness.isAvailable ? .health : .units)
                            }
                        }
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
            }
        }
        .background(Theme.background.ignoresSafeArea())
    }

    private func detail(for choice: WearableChoice) -> String? {
        switch choice {
        case .oura, .garmin: return "Through Apple Health, once its app syncs there"
        case .otherAppleHealth: return "Any app that saves to Apple Health"
        default: return nil
        }
    }

    // MARK: Fitbit

    private var fitbit: some View {
        OnboardingPage(
            title: "Fitbit is coming next",
            subtitle: "A direct Fitbit connection is on the way. Until then, anything that reaches Apple Health on this iPhone still counts toward your scores.",
            onBack: back,
            primaryTitle: wellness.isAvailable ? "Connect Apple Health" : "Continue",
            onPrimary: { go(wellness.isAvailable ? .health : .units) },
            secondaryTitle: "Skip for now",
            onSecondary: { go(.units) }
        ) {
            SoftSymbolTile(symbol: "figure.walk.motion", colors: [Color(hex: 0x8DE3D2), Color(hex: 0x0D9488)], size: 180)
        }
    }

    // MARK: 6. Apple Health

    private var health: some View {
        OnboardingPage(
            title: "Allow access to Health",
            subtitle: "Healyx reads sleep, heart rate, heart rate variability, workouts and food logs to estimate your daily sleep, recovery, stress and nutrition scores. It never writes to Apple Health.",
            onBack: back,
            onPrimary: { go(.reading) },
            secondaryTitle: "Not now",
            onSecondary: { go(.units) }
        ) {
            ZStack {
                RoundedRectangle(cornerRadius: 30, style: .continuous)
                    .fill(Color.white)
                    .frame(width: 110, height: 110)
                    .shadow(color: Theme.shadow.opacity(0.12), radius: 16, y: 8)
                Image(systemName: "heart.fill")
                    .font(.system(size: 50))
                    .foregroundStyle(LinearGradient(colors: [Color(hex: 0xFF6B9A), Color(hex: 0xF2403A)],
                                                    startPoint: .top, endPoint: .bottom))
            }
            .accessibilityHidden(true)
        }
    }

    private var reading: some View {
        OnboardingPage(
            title: "Reading your data",
            subtitle: "Healyx is reading the last month from Apple Health. This usually takes a few seconds.",
            primaryEnabled: readProgress >= 1,
            onPrimary: { go(.connected) },
            titleOnTop: false
        ) {
            ZStack {
                Circle().stroke(Theme.secondary, lineWidth: 12)
                Circle()
                    .trim(from: 0, to: readProgress)
                    .stroke(Theme.primary, style: StrokeStyle(lineWidth: 12, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text("\(Int((readProgress * 100).rounded()))%")
                    .font(.system(size: 40, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(Theme.foreground)
            }
            .frame(width: 150, height: 150)
        }
        .task { await readHealth() }
    }

    private func readHealth() async {
        readProgress = 0
        let start = Date()
        let flag = DoneFlag()
        let connectTask = Task {
            await wellness.connect()
            flag.done = true
        }
        while true {
            try? await Task.sleep(nanoseconds: 100_000_000)
            let elapsed = Date().timeIntervalSince(start)
            let finished = (flag.done && !wellness.isLoading && elapsed > 1.2) || elapsed > 8
            withAnimation(.linear(duration: 0.1)) {
                readProgress = finished ? 1 : min(elapsed / 5, 0.92)
            }
            if finished { break }
        }
        _ = connectTask
        try? await Task.sleep(nanoseconds: 500_000_000)
        if step == .reading { go(.connected) }
    }

    private var connected: some View {
        OnboardingPage(
            title: wellness.connected ? "Connected" : "Almost there",
            subtitle: wellness.connected
                ? "You can change what Healyx reads anytime in the Health app, under Sharing."
                : "Apple Health didn't finish connecting. You can connect it later from Home.",
            onPrimary: { go(.units) },
            secondaryTitle: "Connect another device",
            onSecondary: { go(.wearable) },
            titleOnTop: false
        ) {
            Image(systemName: wellness.connected ? "checkmark.seal.fill" : "exclamationmark.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(wellness.connected ? Theme.green : Theme.amber)
                .accessibilityHidden(true)
        }
    }

    // MARK: 7. Units

    private var units: some View {
        OnboardingPage(
            title: "How should we show your numbers?",
            onBack: back,
            onPrimary: { go(.notifications) },
            titleOnTop: false
        ) {
            VStack(spacing: 14) {
                OnboardingChoiceCard(title: "Imperial", detail: "Pounds, feet, Fahrenheit",
                                     selected: store.units == .imperial) { store.units = .imperial }
                OnboardingChoiceCard(title: "Metric", detail: "Kilograms, centimeters, Celsius",
                                     selected: store.units == .metric) { store.units = .metric }
                Text("You can change this later.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
                    .padding(.top, 6)
            }
            .padding(.horizontal, 24)
        }
    }

    // MARK: 8. Notifications and location

    private var notifications: some View {
        OnboardingPage(
            title: "Reminders that keep you on track",
            subtitle: "Get medication and refill reminders, and a heads-up when an agent has something for you to review.",
            onBack: back,
            primaryTitle: "Turn on notifications",
            onPrimary: {
                Task {
                    await store.requestNotifications()
                    go(.location)
                }
            },
            secondaryTitle: "Skip for now",
            onSecondary: { go(.location) }
        ) {
            VStack(spacing: 18) {
                Image(systemName: "bell.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(LinearGradient(colors: [Color(hex: 0xB9DFFF), Color(hex: 0x5DA6EC)],
                                                    startPoint: .top, endPoint: .bottom))
                HStack(alignment: .top, spacing: 12) {
                    Image("HealyxIcon")
                        .resizable()
                        .frame(width: 40, height: 40)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text("Refill reminder").font(.subheadline.weight(.semibold))
                            Spacer()
                            Text("now").font(.caption).foregroundStyle(Theme.muted)
                        }
                        Text("Your Medications agent drafted a refill request for you to review.")
                            .font(.subheadline)
                            .foregroundStyle(Theme.foreground.opacity(0.85))
                    }
                }
                .padding(14)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Color.white.opacity(0.6)))
                .shadow(color: Theme.shadow.opacity(0.1), radius: 14, y: 6)
                .padding(.horizontal, 24)
                .accessibilityHidden(true)
            }
        }
    }

    private var location: some View {
        OnboardingPage(
            title: "Show today's weather",
            subtitle: "Healyx uses your approximate location to show the weather on Home. It isn't saved to your account.",
            onBack: back,
            primaryTitle: "Allow location",
            onPrimary: {
                store.requestLocation()
                go(.setup)
            },
            secondaryTitle: "Skip for now",
            onSecondary: { go(.setup) }
        ) {
            SoftSymbolTile(symbol: "location.fill", colors: [Color(hex: 0xB3E0FF), Color(hex: 0x2B8BE0)], size: 170)
        }
    }

    // MARK: 9. Finish

    private var setup: some View {
        OnboardingPage(
            title: "Now, let's set up your Home.",
            onBack: back,
            onPrimary: { go(.personalizing) },
            titleOnTop: false
        ) {
            HealyxOrb(size: 120)
        }
    }

    private var personalizing: some View {
        VStack(spacing: 22) {
            Spacer()
            ProgressView()
                .controlSize(.large)
            Text("Setting up your Home...")
                .font(.title2.weight(.semibold))
                .foregroundStyle(Theme.foreground)
            Text("Pulling in your records and today's scores.")
                .font(.body)
                .foregroundStyle(Theme.muted)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background.ignoresSafeArea())
        .task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            finish()
        }
    }
}
#endif

#if os(macOS)
/// The Mac gets one compact page: name and units, then Home.
private struct MacWelcome: View {
    @Bindable var store: OnboardingStore
    let finish: () -> Void

    var body: some View {
        VStack(spacing: 22) {
            HealyxOrb(size: 110)
            Text("Welcome to Healyx")
                .font(.system(size: 30, weight: .semibold))
            Text("Your Apple Health scores come from your iPhone and show up here once it syncs.")
                .font(.body)
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)

            TextField("First name", text: $store.firstName)
                .textFieldStyle(.plain)
                .font(.title3)
                .padding(14)
                .background(Theme.secondary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .frame(maxWidth: 320)

            Picker("Units", selection: $store.units) {
                Text("Imperial").tag(UnitSystem.imperial)
                Text("Metric").tag(UnitSystem.metric)
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 320)

            Button {
                Task {
                    await store.saveFirstName()
                    finish()
                }
            } label: {
                if store.isSavingName { ProgressView().tint(.white) } else { Text("Continue") }
            }
            .buttonStyle(PillButtonStyle(kind: .ink))
            .frame(maxWidth: 320)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .healyxBackground()
    }
}
#endif
