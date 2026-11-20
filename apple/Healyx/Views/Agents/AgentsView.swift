import SwiftUI
import HealyxKit

enum AgentRoute: Hashable {
    case agent(AgentID)
    case task(String)
}

/// The four health agents and the shared task queue.
struct AgentsView: View {
    @Environment(AgentsStore.self) private var agents

    #if os(macOS)
    private static let columns = 4
    #else
    private static let columns = 2
    #endif

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Hand off the follow-through").eyebrow()
                    Text("Health agents").font(.largeTitle.weight(.semibold)).tracking(-0.8)
                    Text("Agents draft requests, set reminders and pull research from your records. They don't book, order or contact anyone for you.")
                        .font(.subheadline).foregroundStyle(Theme.muted)
                }
                .padding(.top, 8)

                if let banner = agents.banner {
                    ErrorBanner(message: banner) { agents.banner = nil }
                }

                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 14), count: Self.columns), spacing: 14) {
                    ForEach(AgentID.allCases) { agent in
                        NavigationLink(value: AgentRoute.agent(agent)) {
                            AgentOrbTile(agent: agent, openCount: agents.openTasks(for: agent).count)
                        }
                        .buttonStyle(.plain)
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Your queue").font(.headline)
                        Spacer()
                        Text("\(agents.openTasks().count) open").font(.caption).foregroundStyle(Theme.muted)
                    }
                    let open = agents.openTasks()
                    if open.isEmpty {
                        Text(agents.hasLoaded ? "Nothing waiting. Ask an agent to help with an appointment, refill, research question or shopping list." : "Loading…")
                            .font(.footnote).foregroundStyle(Theme.muted)
                    } else {
                        ForEach(open) { task in
                            NavigationLink(value: AgentRoute.task(task.id)) {
                                TaskRow(task: task)
                            }
                            .buttonStyle(.plain)
                            if task.id != open.last?.id { Divider() }
                        }
                    }
                }
                .card()
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .frame(maxWidth: 900)
            .frame(maxWidth: .infinity)
        }
        .healyxBackground()
        .refreshable { await agents.reload() }
        .navigationTitle("Agents")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .navigationDestination(for: AgentRoute.self) { route in
            switch route {
            case .agent(let agent): AgentDetailView(agent: agent)
            case .task(let id): TaskDetailView(taskID: id)
            }
        }
    }
}

extension AgentID {
    /// Each agent's orb colors.
    var palette: OrbPalette {
        switch self {
        case .appointments:
            return OrbPalette(light: Color(hex: 0xDDF0FF), base: Color(hex: 0x6FB6FF),
                              deep: Color(hex: 0x3B6FE0), accent: Color(hex: 0xB79CFF))
        case .medications:
            return OrbPalette(light: Color(hex: 0xE0FBF0), base: Color(hex: 0x5ED9A8),
                              deep: Color(hex: 0x139A7A), accent: Color(hex: 0x8FDDFF))
        case .research:
            return OrbPalette(light: Color(hex: 0xEFE8FF), base: Color(hex: 0xA58BFF),
                              deep: Color(hex: 0x6548DE), accent: Color(hex: 0xFF9DD3))
        case .shopping:
            return OrbPalette(light: Color(hex: 0xFFEEDB), base: Color(hex: 0xFFB36E),
                              deep: Color(hex: 0xEE6B45), accent: Color(hex: 0xFF90B3))
        }
    }
}

/// An agent as a glowing gradient orb with its symbol inside.
struct AgentAvatar: View {
    let agent: AgentID
    var size: CGFloat = 44

    var body: some View {
        ZStack {
            GradientOrb(palette: agent.palette, size: size, glow: size >= 40)
            Image(systemName: agent.symbol)
                .font(.system(size: size * 0.34, weight: .semibold))
                .foregroundStyle(Color.white.opacity(0.95))
                .shadow(color: Color.black.opacity(0.15), radius: 2, x: 0, y: 1)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

private struct AgentOrbTile: View {
    let agent: AgentID
    let openCount: Int

    var body: some View {
        VStack(spacing: 12) {
            AgentAvatar(agent: agent, size: 76)
                .padding(.top, 10)
            Text(agent.name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Theme.foreground)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(Theme.secondary, in: Capsule())
            Text(agent.tagline)
                .font(.caption)
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .lineLimit(2, reservesSpace: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
        .padding(.horizontal, 12)
        .background {
            ZStack(alignment: .top) {
                Theme.card
                RadialGradient(colors: [agent.palette.base.opacity(0.22), agent.palette.base.opacity(0)],
                               center: .top, startRadius: 0, endRadius: 150)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Theme.border.opacity(0.6), lineWidth: 0.5))
        .shadow(color: Theme.shadow.opacity(0.07), radius: 18, x: 0, y: 8)
        .overlay(alignment: .topTrailing) {
            if openCount > 0 {
                Chip(text: "\(openCount) open").padding(12)
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

struct TaskRow: View {
    let task: AgentTask

    var body: some View {
        HStack(spacing: 12) {
            if let agent = task.agent {
                AgentAvatar(agent: agent, size: 34)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(task.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.foreground).lineLimit(2)
                Text([task.kind.label, task.summaryLine].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
            }
            Spacer()
            if task.status == .waiting { Chip(text: "Waiting", color: Theme.warning) }
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.muted)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}

struct TaskDetailView: View {
    @Environment(AgentsStore.self) private var agents
    let taskID: String

    var body: some View {
        ScrollView {
            Group {
                if let task = agents.task(id: taskID) {
                    TaskCardView(task: task)
                } else {
                    Text("This task is no longer in your queue.")
                        .foregroundStyle(Theme.muted)
                        .padding(.top, 40)
                }
            }
            .padding(20)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
        .healyxBackground()
        .navigationTitle("Task")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }
}

// MARK: - One agent

struct AgentDetailView: View {
    @Environment(AgentsStore.self) private var agents
    let agent: AgentID

    enum Mode: String, CaseIterable, Identifiable {
        case chat = "Chat", tasks = "Tasks"
        var id: String { rawValue }
    }

    @State private var mode: Mode = .chat
    @State private var draft = ""
    @FocusState private var inputFocused: Bool

    private var messages: [AgentMessage] { agents.messages[agent] ?? [] }
    private var isSending: Bool { agents.sending.contains(agent) }

    var body: some View {
        VStack(spacing: 0) {
            Picker("View", selection: $mode) {
                ForEach(Mode.allCases) { mode in
                    Text(mode == .tasks ? "Tasks (\(agents.openTasks(for: agent).count))" : mode.rawValue).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            switch mode {
            case .chat: chat
            case .tasks: tasks
            }
        }
        .healyxBackground()
        .navigationTitle(agent.name)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    private var chat: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        intro
                        MessageBubble(role: .assistant, text: agent.intro)
                        ForEach(messages) { message in
                            VStack(alignment: .leading, spacing: 6) {
                                MessageBubble(role: message.role, text: message.content)
                                if let meta = message.meta, message.role == .assistant {
                                    WorkLog(steps: meta.steps, duration: meta.durationText)
                                    SourceChips(sources: meta.sources)
                                }
                            }
                            .id(message.id)
                        }
                        if isSending {
                            VStack(alignment: .leading, spacing: 6) {
                                TypingIndicator()
                                WorkLog(steps: agents.liveSteps[agent] ?? [], duration: nil, live: true)
                            }
                            .id("typing")
                        }
                        if let error = agents.errors[agent] {
                            ErrorBanner(message: error) { agents.errors[agent] = nil }
                        }
                        let open = agents.openTasks(for: agent).count
                        if open > 0 && !messages.isEmpty {
                            Button {
                                mode = .tasks
                            } label: {
                                Label("\(open) open task\(open == 1 ? "" : "s") in your queue", systemImage: "checklist")
                                    .font(.footnote.weight(.semibold))
                            }
                            .buttonStyle(.bordered)
                            .id("tasks-link")
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: 760)
                    .frame(maxWidth: .infinity)
                }
                #if os(iOS)
                .scrollDismissesKeyboard(.interactively)
                #endif
                .onAppear { if let last = messages.last?.id { proxy.scrollTo(last, anchor: .bottom) } }
                .onChange(of: messages.count) {
                    if let last = messages.last?.id { withAnimation { proxy.scrollTo(last, anchor: .bottom) } }
                }
                .onChange(of: agents.liveSteps[agent]?.count ?? 0) {
                    if isSending { proxy.scrollTo("typing", anchor: .bottom) }
                }
            }
            InputBar(text: $draft, placeholder: agent.howTo, isSending: isSending, focused: $inputFocused) {
                send(draft)
            }
        }
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                AgentAvatar(agent: agent, size: 56)
                VStack(alignment: .leading, spacing: 2) {
                    Text(agent.name).font(.headline)
                    Text(agent.tagline).font(.footnote).foregroundStyle(Theme.muted)
                }
            }
            VStack(alignment: .leading, spacing: 6) {
                ForEach(agent.capabilities, id: \.self) { capability in
                    let works = capability.status == .works
                    Label {
                        Text(capability.label + (capability.status == .coming ? " (coming)" : capability.status == .needsConnection ? " (needs a connection)" : ""))
                            .foregroundStyle(works ? Theme.foreground : Theme.muted)
                    } icon: {
                        Image(systemName: works ? "checkmark.circle.fill" : capability.status == .coming ? "clock" : "link")
                            .foregroundStyle(works ? Theme.primary : Theme.muted)
                    }
                    .font(.footnote)
                }
            }
            Text("Uses \(agent.usesRecords).").font(.caption).foregroundStyle(Theme.muted)
            if messages.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(agent.starters, id: \.self) { starter in
                        Button {
                            send(starter)
                        } label: {
                            HStack {
                                Text(starter).multilineTextAlignment(.leading)
                                Spacer()
                                Image(systemName: "arrow.up.right")
                            }
                            .font(.subheadline)
                            .padding(12)
                            .background(Theme.secondary.opacity(0.7), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .card()
    }

    private var tasks: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                let open = agents.openTasks(for: agent)
                if open.isEmpty {
                    Text("No open tasks. Ask \(agent.name) for help and drafts will appear here.")
                        .font(.footnote).foregroundStyle(Theme.muted)
                        .padding(.top, 20)
                }
                ForEach(open) { task in
                    TaskCardView(task: task)
                }
                let done = agents.doneTasks(for: agent)
                if !done.isEmpty {
                    DisclosureGroup("Done (\(done.count))") {
                        VStack(spacing: 12) {
                            ForEach(done) { task in TaskCardView(task: task) }
                        }
                        .padding(.top, 8)
                    }
                    .font(.subheadline.weight(.semibold))
                    .padding(.top, 8)
                }
            }
            .padding(16)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
    }

    private func send(_ text: String) {
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty, !isSending else { return }
        draft = ""
        Task {
            // On failure the message comes back to the input so it can be resent.
            if await !agents.send(message, to: agent), draft.isEmpty { draft = message }
        }
    }
}

/// The steps an agent took ("Searching the web: …"), live while it works and
/// collapsed under each saved reply.
struct WorkLog: View {
    let steps: [AgentStep]
    let duration: String?
    var live = false
    @State private var expanded = false

    var body: some View {
        if live || !steps.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Button {
                    withAnimation(.snappy) { expanded.toggle() }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: live ? "gearshape.2" : "checklist")
                        Text(summary)
                        if !live && !steps.isEmpty {
                            Image(systemName: "chevron.down").rotationEffect(.degrees(expanded ? 180 : 0))
                        }
                    }
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                }
                .buttonStyle(.plain)
                .disabled(live)

                if live || expanded {
                    ForEach(steps) { step in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            stepIcon(step.status)
                            Text(step.label).font(.caption).foregroundStyle(Theme.foreground.opacity(0.85))
                        }
                    }
                }
            }
            .padding(.leading, 4)
        }
    }

    private var summary: String {
        if live { return steps.isEmpty ? "Thinking…" : "Working · \(steps.count) \(steps.count == 1 ? "step" : "steps")" }
        return ["Worked", duration.map { "for \($0)" }, "· \(steps.count) \(steps.count == 1 ? "step" : "steps")"]
            .compactMap { $0 }.joined(separator: " ")
    }

    @ViewBuilder private func stepIcon(_ status: AgentStep.Status) -> some View {
        switch status {
        case .running: ProgressView().controlSize(.mini)
        case .done: Image(systemName: "checkmark").font(.caption2.weight(.bold)).foregroundStyle(Theme.primary)
        case .error: Image(systemName: "exclamationmark.triangle").font(.caption2).foregroundStyle(Theme.warning)
        }
    }
}

/// Web pages an agent read, as tappable chips.
struct SourceChips: View {
    let sources: [MessageMeta.Source]

    var body: some View {
        if !sources.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(sources, id: \.self) { source in
                        Link(destination: source.url) {
                            Label(source.url.host ?? source.title, systemImage: "globe")
                                .font(.caption2)
                                .lineLimit(1)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Theme.secondary, in: Capsule())
                        }
                        .help(source.title)
                    }
                }
            }
        }
    }
}
