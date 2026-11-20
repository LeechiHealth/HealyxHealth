import Foundation

// Health agents: the same four agents, copy and task kinds as the web app
// (lib/agents/config.ts and lib/agents/tasks.ts).

public enum AgentID: String, Codable, CaseIterable, Identifiable, Hashable, Sendable {
    case appointments, medications, research, shopping

    public var id: String { rawValue }

    public var name: String {
        switch self {
        case .appointments: return "Appointments"
        case .medications: return "Medications"
        case .research: return "Research"
        case .shopping: return "Shopping"
        }
    }

    public var tagline: String {
        switch self {
        case .appointments: return "Finds care, preps visits, sets reminders"
        case .medications: return "Reminders, refills and label checks"
        case .research: return "Studies, labels, trials and the web"
        case .shopping: return "Finds supplies, checks them against your meds"
        }
    }

    /// The agent's first message: who it is, in its own voice.
    public var intro: String {
        switch self {
        case .appointments: return "Hey, I'm Appointments. I find doctors and clinics online, get your visits ready and keep them on your calendar."
        case .medications: return "Hi, I'm Medications. I keep your doses and refills on track and check labels when something new comes up."
        case .research: return "Hi, I'm Research. I dig through studies, FDA labels, trials and the web, then tell you what holds up."
        case .shopping: return "Hey, I'm Shopping. I find health supplies and over-the-counter products online and check them against your meds."
        }
    }

    /// How to use it, in seven words or fewer.
    public var howTo: String {
        switch self {
        case .appointments: return "Tell me who, when, or what's wrong."
        case .medications: return "Name a medication and what you need."
        case .research: return "Ask any health question in plain words."
        case .shopping: return "Tell me what you need to buy."
        }
    }

    /// SF Symbol for the agent's avatar.
    public var symbol: String {
        switch self {
        case .appointments: return "calendar.badge.clock"
        case .medications: return "pills.fill"
        case .research: return "books.vertical.fill"
        case .shopping: return "bag.fill"
        }
    }

    /// Which saved records this agent sends to the AI provider (shown to the user).
    public var usesRecords: String {
        switch self {
        case .appointments: return "your condition names, medication names and listed prescribers"
        case .medications: return "your medication list, doses, pharmacy and prescribers"
        case .research: return "your condition and medication names"
        case .shopping: return "your medication and condition names"
        }
    }

    /// What the agent can do today versus what is planned. Labels must stay honest, as on the web.
    public var capabilities: [AgentCapability] {
        switch self {
        case .appointments:
            return [.init("Browse the web for doctors, clinics and hours", .works),
                    .init("Draft appointment requests and call scripts", .works),
                    .init("Reminders on your calendar", .works),
                    .init("Fill in booking forms, with your approval", .coming),
                    .init("Scheduled check-ins", .coming)]
        case .medications:
            return [.init("Daily medication reminders on your calendar", .works),
                    .init("Refill drafts with run-out dates worked out", .works),
                    .init("FDA label and web lookups", .works),
                    .init("Request refills on pharmacy sites, with your approval", .coming),
                    .init("Scheduled refill check-ins", .coming)]
        case .research:
            return [.init("PubMed, FDA labels and recruiting trials", .works),
                    .init("Web browsing for guidelines and news", .works),
                    .init("Briefs where every point cites a source", .works),
                    .init("Weekly alerts when new research appears", .coming)]
        case .shopping:
            return [.init("Browse stores and reviews for options", .works),
                    .init("OTC label check against your records", .works),
                    .init("Shopping lists with what to look for", .works),
                    .init("Add to cart on store sites, with your approval", .coming)]
        }
    }

    public var starters: [String] {
        switch self {
        case .appointments:
            return ["Help me book my annual physical",
                    "I have a dentist appointment next Thursday at 2:30pm. Remind me.",
                    "What should I ask at my next checkup?"]
        case .medications:
            return ["Set up reminders for my medications",
                    "I have 10 doses left and take it once a day. When should I refill?",
                    "Draft a refill request for my pharmacy"]
        case .research:
            return ["What does the research say about magnesium for sleep?",
                    "Check the FDA labels for my medications",
                    "Are there recruiting trials for my condition?"]
        case .shopping:
            return ["I need a home blood pressure monitor",
                    "What should be in a cold and flu kit?",
                    "Can I pick up ibuprofen with my current meds?"]
        }
    }
}

public struct AgentCapability: Hashable, Sendable {
    public enum Status: String, Sendable { case works, needsConnection, coming }

    public let label: String
    public let status: Status

    public init(_ label: String, _ status: Status) {
        self.label = label
        self.status = status
    }
}

public enum TaskKind: String, Codable, Sendable {
    case appointment, medReminder = "med_reminder", refillRequest = "refill_request"
    case researchBrief = "research_brief", shoppingList = "shopping_list", unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = TaskKind(rawValue: raw) ?? .unknown
    }

    public var label: String {
        switch self {
        case .appointment: return "Appointment"
        case .medReminder: return "Medication reminder"
        case .refillRequest: return "Refill"
        case .researchBrief: return "Research brief"
        case .shoppingList: return "Shopping list"
        case .unknown: return "Task"
        }
    }

    /// Label for the "done" button, matching the web task card.
    public var doneLabel: String {
        switch self {
        case .appointment: return "Booked"
        case .medReminder: return "Reminders set"
        case .refillRequest: return "Requested"
        case .researchBrief: return "Read"
        case .shoppingList: return "Bought"
        case .unknown: return "Done"
        }
    }
}

public enum TaskStatus: String, Codable, CaseIterable, Sendable {
    case todo, waiting, done, dismissed

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = TaskStatus(rawValue: raw) ?? .todo
    }

    public var label: String {
        switch self {
        case .todo: return "To do"
        case .waiting: return "Waiting"
        case .done: return "Done"
        case .dismissed: return "Dismissed"
        }
    }
}

public struct AgentTask: Decodable, Identifiable, Hashable, Sendable {
    public var id: String
    public var agent: AgentID?
    public var kind: TaskKind
    public var title: String
    public var status: TaskStatus
    public var dueAt: String?
    public var payload: JSONValue
    public var createdAt: String?
    /// True when the server could not save the task (it only exists in this session).
    public var local: Bool

    enum CodingKeys: String, CodingKey {
        case id, agent, kind, title, status, payload, local
        case dueAt = "due_at"
        case createdAt = "created_at"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.rowID(.id)
        agent = (try? c.decodeIfPresent(String.self, forKey: .agent)).flatMap(AgentID.init(rawValue:))
        kind = (try? c.decodeIfPresent(TaskKind.self, forKey: .kind)) ?? .unknown
        title = c.lossyString(.title) ?? "Task"
        status = (try? c.decodeIfPresent(TaskStatus.self, forKey: .status)) ?? .todo
        dueAt = c.lossyString(.dueAt)
        payload = (try? c.decodeIfPresent(JSONValue.self, forKey: .payload)) ?? .object([:])
        createdAt = c.lossyString(.createdAt)
        local = (try? c.decodeIfPresent(Bool.self, forKey: .local)) ?? false
    }

    public var isOpen: Bool { status == .todo || status == .waiting }

    /// One-line summary under the title (port of the web `summaryLine`).
    public var summaryLine: String {
        let p = payload
        switch kind {
        case .appointment:
            if let when = HealyxDate.displayLocalDateTime(p["starts_at"]?.string) { return when }
            return [p["provider"]?.string, "Draft request ready"].compactMap { $0 }.joined(separator: " · ")
        case .medReminder:
            let times = (p["times"]?.stringArray ?? []).map(HealyxDate.displayClock).joined(separator: ", ")
            return times + ((p["times_confirmed"]?.bool ?? false) ? "" : " · suggested")
        case .refillRequest:
            if let day = HealyxDate.displayDay(p["remind_on"]?.string) { return "Request by \(day)" }
            return p["pharmacy"]?.string ?? "Draft request ready"
        case .researchBrief:
            let sources = p["sources"]?.array.count ?? 0
            let mentions = p["label_mentions"]?.array.count ?? 0
            return "\(sources) source\(sources == 1 ? "" : "s")" + (mentions > 0 ? " · \(mentions) label mention\(mentions > 1 ? "s" : "")" : "")
        case .shoppingList:
            return "\(p["items"]?.array.count ?? 0) items"
        case .unknown:
            return ""
        }
    }
}

public struct AgentMessage: Decodable, Identifiable, Hashable, Sendable {
    public var id: String
    public var agent: AgentID?
    public var role: ChatRole
    public var content: String
    public var createdAt: String?
    /// The reply's work history (steps, web sources, time taken), when saved.
    public var meta: MessageMeta?

    enum CodingKeys: String, CodingKey {
        case id, agent, role, content, meta
        case createdAt = "created_at"
    }

    public init(id: String, agent: AgentID?, role: ChatRole, content: String, createdAt: String?, meta: MessageMeta? = nil) {
        self.id = id; self.agent = agent; self.role = role; self.content = content; self.createdAt = createdAt; self.meta = meta
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.rowID(.id)
        agent = (try? c.decodeIfPresent(String.self, forKey: .agent)).flatMap(AgentID.init(rawValue:))
        role = (try? c.decode(ChatRole.self, forKey: .role)) ?? .assistant
        content = c.lossyString(.content) ?? ""
        createdAt = c.lossyString(.createdAt)
        meta = (try? c.decodeIfPresent(JSONValue.self, forKey: .meta)).flatMap(MessageMeta.init(json:))
    }
}

/// One step an agent took (a web search, a label lookup, saving a task).
public struct AgentStep: Identifiable, Hashable, Sendable {
    public enum Status: String, Sendable { case running, done, error }

    public var id: String
    public var label: String
    public var status: Status

    public init(id: String, label: String, status: Status) {
        self.id = id; self.label = label; self.status = status
    }

    init?(json: JSONValue?) {
        guard let json, let label = json["label"]?.string else { return nil }
        id = json["id"]?.string ?? json["id"]?.int.map(String.init) ?? label
        self.label = label
        status = Status(rawValue: json["status"]?.string ?? "") ?? .done
    }
}

/// Work history saved with an agent reply.
public struct MessageMeta: Hashable, Sendable {
    public struct Source: Hashable, Sendable {
        public var title: String
        public var url: URL
    }

    public var durationMs: Int?
    public var steps: [AgentStep]
    public var sources: [Source]
    public var provider: String?

    public init?(json: JSONValue) {
        guard json.object != nil else { return nil }
        durationMs = json["duration_ms"]?.int
        steps = json["steps"]?.array.enumerated().compactMap { index, step in
            AgentStep(json: step).map { AgentStep(id: "\(index)", label: $0.label, status: $0.status) }
        } ?? []
        sources = json["sources"]?.array.compactMap { source in
            guard let title = source["title"]?.string, let url = source["url"]?.string.flatMap(URL.init(string:)) else { return nil }
            return Source(title: title, url: url)
        } ?? []
        provider = json["provider"]?.string
    }

    /// "12 s" or "1 min 5 s".
    public var durationText: String? {
        guard let ms = durationMs, ms > 0 else { return nil }
        let seconds = max(1, Int((Double(ms) / 1000).rounded()))
        return seconds < 60 ? "\(seconds) s" : "\(seconds / 60) min \(seconds % 60) s"
    }
}

public enum ChatRole: String, Codable, Sendable {
    case user, assistant
}

/// Weekday codes used in medication reminder payloads ("MO"..."SU").
public enum Weekday: String, CaseIterable, Sendable {
    case MO, TU, WE, TH, FR, SA, SU

    /// Calendar weekday number (Sunday = 1).
    public var calendarWeekday: Int {
        switch self {
        case .SU: return 1
        case .MO: return 2
        case .TU: return 3
        case .WE: return 4
        case .TH: return 5
        case .FR: return 6
        case .SA: return 7
        }
    }

    public var shortName: String {
        switch self {
        case .MO: return "Mon"
        case .TU: return "Tue"
        case .WE: return "Wed"
        case .TH: return "Thu"
        case .FR: return "Fri"
        case .SA: return "Sat"
        case .SU: return "Sun"
        }
    }

    /// The valid weekdays in a payload. Empty or all seven means every day.
    public static func parse(_ values: [String]) -> [Weekday] {
        let set = Set(values)
        let valid = Weekday.allCases.filter { set.contains($0.rawValue) }
        return valid.count == 7 ? [] : valid
    }
}

/// Store search links for shopping items (same stores as the web).
public enum StoreSearch: String, CaseIterable, Sendable {
    case amazon = "Amazon", cvs = "CVS", walgreens = "Walgreens"

    public func url(for query: String) -> URL? {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        let q = query.addingPercentEncoding(withAllowedCharacters: allowed) ?? query
        switch self {
        case .amazon: return URL(string: "https://www.amazon.com/s?k=\(q)")
        case .cvs: return URL(string: "https://www.cvs.com/search?searchTerm=\(q)")
        case .walgreens: return URL(string: "https://www.walgreens.com/search/results.jsp?Ntt=\(q)")
        }
    }
}
