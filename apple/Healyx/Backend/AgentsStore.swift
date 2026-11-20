import Foundation
import Observation
import Supabase
import HealyxKit

/// Health agents: per-agent conversations and the shared task queue.
/// Running an agent goes through /api/agents/run, which saves the exchange and
/// any tasks to Supabase; status changes are written directly (RLS-protected).
@MainActor
@Observable
final class AgentsStore {
    private(set) var messages: [AgentID: [AgentMessage]] = [:]
    private(set) var tasks: [AgentTask] = []
    private(set) var sending: Set<AgentID> = []
    /// Steps of the run in progress, streamed from the server.
    private(set) var liveSteps: [AgentID: [AgentStep]] = [:]
    var errors: [AgentID: String] = [:]
    var banner: String?
    private(set) var hasLoaded = false

    private let backend: HealyxBackend
    private var userID: String?

    init(backend: HealyxBackend = .shared) {
        self.backend = backend
    }

    func load(userID: String) async {
        self.userID = userID
        let db = backend.supabase
        let decoder = HealyxJSON.decoder
        defer { hasLoaded = true }
        do {
            async let messageData = Self.loadMessages(db: db, userID: userID)
            async let taskData = db.from("agent_tasks").select()
                .eq("user_id", value: userID)
                .neq("status", value: "dismissed")
                .order("created_at", ascending: false).limit(100)
                .execute().data

            let recent = try decoder.decode([AgentMessage].self, from: try await messageData)
            var grouped: [AgentID: [AgentMessage]] = [:]
            for message in recent.reversed() {
                guard let agent = message.agent else { continue }
                grouped[agent, default: []].append(message)
            }
            messages = grouped
            tasks = try decoder.decode([AgentTask].self, from: try await taskData)
            banner = nil
        } catch {
            banner = "Agents couldn't load your history. Pull to refresh and try again."
        }
    }

    /// Reads messages with their work history; falls back to the older columns
    /// if the `meta` migration hasn't been run yet.
    private nonisolated static func loadMessages(db: SupabaseClient, userID: String) async throws -> Data {
        do {
            return try await db.from("agent_messages")
                .select("id, agent, role, content, created_at, meta")
                .eq("user_id", value: userID)
                .order("created_at", ascending: false).limit(200)
                .execute().data
        } catch {
            return try await db.from("agent_messages")
                .select("id, agent, role, content, created_at")
                .eq("user_id", value: userID)
                .order("created_at", ascending: false).limit(200)
                .execute().data
        }
    }

    func reload() async {
        guard let userID else { return }
        await load(userID: userID)
    }

    func reset() {
        messages = [:]; tasks = []; sending = []; liveSteps = [:]; errors = [:]; banner = nil; userID = nil; hasLoaded = false
    }

    func openTasks(for agent: AgentID? = nil) -> [AgentTask] {
        tasks.filter { $0.isOpen && (agent == nil || $0.agent == agent) }
    }

    func doneTasks(for agent: AgentID) -> [AgentTask] {
        tasks.filter { $0.status == .done && $0.agent == agent }
    }

    func task(id: String) -> AgentTask? { tasks.first { $0.id == id } }

    // MARK: Running an agent

    /// Sends a message and waits for the agent to finish. Returns false on failure
    /// (the message is taken back out of the thread so it can be edited and resent).
    @discardableResult
    func send(_ text: String, to agent: AgentID) async -> Bool {
        let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, !sending.contains(agent) else { return false }
        let history = (messages[agent] ?? []).suffix(10).map { ChatTurn(role: $0.role, content: $0.content) }
        let pendingID = "pending-\(UUID().uuidString)"
        messages[agent, default: []].append(
            AgentMessage(id: pendingID, agent: agent, role: .user, content: content, createdAt: nil)
        )
        sending.insert(agent)
        liveSteps[agent] = []
        errors[agent] = nil
        defer {
            sending.remove(agent)
            liveSteps[agent] = nil
        }
        do {
            let result = try await backend.api.runAgent(agent, message: content, history: Array(history)) { [weak self] step in
                await self?.receive(step, for: agent)
            }
            messages[agent, default: []].append(
                AgentMessage(id: "reply-\(UUID().uuidString)", agent: agent, role: .assistant,
                             content: result.reply, createdAt: nil, meta: result.meta)
            )
            tasks.insert(contentsOf: result.tasks, at: 0)
            for update in result.updates {
                if let index = tasks.firstIndex(where: { $0.id == update.id }) { tasks[index].status = update.status }
            }
            if !result.persisted && result.urgent == nil {
                errors[agent] = "This conversation couldn't be saved to your account. It will disappear when you close the app."
            }
            return true
        } catch {
            messages[agent]?.removeAll { $0.id == pendingID }
            errors[agent] = error.localizedDescription
            return false
        }
    }

    private func receive(_ step: AgentStep, for agent: AgentID) {
        var steps = liveSteps[agent] ?? []
        if let index = steps.firstIndex(where: { $0.id == step.id }) {
            steps[index] = step
        } else {
            steps.append(step)
        }
        liveSteps[agent] = steps
    }

    // MARK: Updating tasks

    func setStatus(_ task: AgentTask, to status: TaskStatus) async {
        guard let index = tasks.firstIndex(where: { $0.id == task.id }) else { return }
        let previous = tasks[index].status
        tasks[index].status = status
        guard !task.local, let userID else {
            if status == .dismissed { tasks.removeAll { $0.id == task.id } }
            return
        }
        do {
            _ = try await backend.supabase.from("agent_tasks")
                .update(["status": status.rawValue])
                .eq("id", value: task.id).eq("user_id", value: userID)
                .execute()
            if status == .dismissed { tasks.removeAll { $0.id == task.id } }
        } catch {
            if let i = tasks.firstIndex(where: { $0.id == task.id }) { tasks[i].status = previous }
            banner = "That task couldn't be updated. Please try again."
        }
    }

    /// Merges fields into a task's payload (for example the booked appointment time)
    /// and optionally sets its due date.
    func updatePayload(_ task: AgentTask, patch: [String: JSONValue], dueAt: Date?) async {
        guard let index = tasks.firstIndex(where: { $0.id == task.id }) else { return }
        var payload = tasks[index].payload.object ?? [:]
        for (key, value) in patch { payload[key] = value }
        let previous = tasks[index]
        tasks[index].payload = .object(payload)
        if let dueAt { tasks[index].dueAt = HealyxDate.isoTimestamp(dueAt) }
        guard !task.local, let userID else { return }

        var update: [String: JSONValue] = ["payload": .object(payload)]
        if let dueAt { update["due_at"] = .string(HealyxDate.isoTimestamp(dueAt)) }
        do {
            _ = try await backend.supabase.from("agent_tasks")
                .update(update)
                .eq("id", value: task.id).eq("user_id", value: userID)
                .execute()
        } catch {
            if let i = tasks.firstIndex(where: { $0.id == task.id }) { tasks[i] = previous }
            banner = "That change couldn't be saved. Please try again."
        }
    }
}
