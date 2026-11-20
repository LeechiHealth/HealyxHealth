import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// One turn of conversation history sent to the server.
public struct ChatTurn: Codable, Hashable, Sendable {
    public var role: ChatRole
    public var content: String

    public init(role: ChatRole, content: String) {
        self.role = role
        self.content = content
    }
}

public struct TaskStatusUpdate: Hashable, Sendable {
    public var id: String
    public var status: TaskStatus
}

/// The final result of an agent run.
public struct AgentRunResult: Decodable, Sendable {
    public var reply: String
    public var tasks: [AgentTask]
    /// Existing tasks the agent changed (for example marked done).
    public var updates: [TaskStatusUpdate]
    public var persisted: Bool
    public var meta: MessageMeta?
    /// "emergency" or "crisis" when the server detected an urgent message.
    public var urgent: String?

    enum CodingKeys: String, CodingKey { case reply, tasks, updates, persisted, meta, urgent }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard let reply = c.lossyString(.reply) else {
            throw DecodingError.keyNotFound(CodingKeys.reply, .init(codingPath: c.codingPath, debugDescription: "No reply"))
        }
        self.reply = reply
        // Decode tasks one by one so a single malformed task doesn't hide the reply.
        if let raw = try? c.decodeIfPresent([JSONValue].self, forKey: .tasks) {
            tasks = raw.compactMap { value in
                guard let data = try? HealyxJSON.encoder.encode(value) else { return nil }
                return try? HealyxJSON.decoder.decode(AgentTask.self, from: data)
            }
        } else {
            tasks = []
        }
        let rawUpdates = (try? c.decodeIfPresent([JSONValue].self, forKey: .updates)) ?? []
        updates = rawUpdates.compactMap { value in
            guard let id = value["id"]?.string, let status = value["status"]?.string.flatMap(TaskStatus.init(rawValue:)) else { return nil }
            return TaskStatusUpdate(id: id, status: status)
        }
        persisted = (try? c.decodeIfPresent(Bool.self, forKey: .persisted)) ?? false
        meta = (try? c.decodeIfPresent(JSONValue.self, forKey: .meta)).flatMap(MessageMeta.init(json:))
        urgent = c.lossyString(.urgent)
    }
}

/// One line of the agent stream (newline-delimited JSON from /api/agents/run).
public enum AgentEvent: Sendable {
    case step(AgentStep)
    case done(AgentRunResult)
    case failed(String)

    public static func parse(_ line: String) -> AgentEvent? {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let data = trimmed.data(using: .utf8),
              let object = try? HealyxJSON.decoder.decode(JSONValue.self, from: data),
              let type = object["type"]?.string else { return nil }
        switch type {
        case "step":
            return AgentStep(json: object["step"]).map { .step($0) }
        case "done":
            return (try? HealyxJSON.decoder.decode(AgentRunResult.self, from: data)).map { .done($0) }
        case "error":
            return .failed(object["error"]?.string ?? "The agent couldn't finish. Please try again.")
        default:
            return nil
        }
    }
}

public enum HealyxAPIError: LocalizedError, Equatable, Sendable {
    /// The server answered with an error message meant for the person.
    case server(status: Int, message: String)
    case invalidResponse(status: Int)
    case notSignedIn

    public var errorDescription: String? {
        switch self {
        case .server(_, let message): return message
        case .invalidResponse(let status): return "Healyx returned an unexpected response (\(status)). Please try again."
        case .notSignedIn: return "Your session has expired. Sign in again to continue."
        }
    }
}

/// Client for the Healyx web API (the Next.js routes on Vercel).
/// Every route verifies the Supabase access token, so the native app shares the
/// same server logic, AI models and row-level security as the website.
public struct HealyxAPI: Sendable {
    public typealias TokenProvider = @Sendable () async throws -> String

    public let baseURL: URL
    private let token: TokenProvider
    private let session: URLSession

    public init(baseURL: URL, session: URLSession = .shared, token: @escaping TokenProvider) {
        self.baseURL = baseURL
        self.session = session
        self.token = token
    }

    // MARK: Requests (public so they can be tested without a network)

    /// One photo sent with a chat message, already JPEG-encoded and base64'd.
    public struct ChatImage: Hashable, Sendable {
        public var mimeType: String
        public var base64: String

        public init(mimeType: String = "image/jpeg", base64: String) {
            self.mimeType = mimeType
            self.base64 = base64
        }
    }

    /// A lab result the guide read from a photo of a lab report.
    public struct ExtractedLab: Decodable, Hashable, Sendable, Identifiable {
        public var id: String { name + "|" + (date ?? "") }
        public var name: String
        public var value: Double?
        public var valueText: String?
        public var unit: String?
        public var range: String?
        public var date: String?

        enum CodingKeys: String, CodingKey { case name, value, unit, range, date }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            name = c.lossyString(.name) ?? ""
            value = c.lossyDouble(.value)
            valueText = c.lossyString(.value)
            unit = c.lossyString(.unit)
            range = c.lossyString(.range)
            date = c.lossyString(.date)
        }
    }

    /// A chat answer, plus any lab results read from a photo.
    public struct ChatResult: Decodable, Sendable {
        public var reply: String
        public var extractedLabs: [ExtractedLab]

        enum CodingKeys: String, CodingKey { case reply, extractedLabs }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            reply = try c.decode(String.self, forKey: .reply)
            let labs: [ExtractedLab]? = try? c.decodeIfPresent([ExtractedLab].self, forKey: .extractedLabs)
            extractedLabs = (labs ?? []).filter { !$0.name.isEmpty }
        }
    }

    public static func chatBody(message: String, history: [ChatTurn], images: [ChatImage] = [], voice: Bool = false) -> [String: JSONValue] {
        // The route accepts at most 20 turns of up to 4,000 characters each.
        let turns = history.suffix(20).map { turn -> JSONValue in
            .object(["role": .string(turn.role.rawValue), "content": .string(String(turn.content.prefix(4000)))])
        }
        var body: [String: JSONValue] = ["message": .string(String(message.prefix(4000))), "conversationHistory": .array(Array(turns))]
        if !images.isEmpty {
            body["images"] = .array(images.prefix(3).map { image in
                .object(["mimeType": .string(image.mimeType), "data": .string(image.base64)])
            })
        }
        if voice { body["voice"] = .bool(true) }
        return body
    }

    public static func agentBody(agent: AgentID, message: String, history: [ChatTurn],
                                 now: Date, timeZone: TimeZone) -> [String: JSONValue] {
        // The route accepts at most 12 turns; the web sends the latest ones.
        let turns = history.suffix(12).map { turn -> JSONValue in
            .object(["role": .string(turn.role.rawValue), "content": .string(String(turn.content.prefix(4000)))])
        }
        return [
            "agent": .string(agent.rawValue),
            "message": .string(String(message.prefix(2000))),
            "history": .array(Array(turns)),
            "now": .string(HealyxDate.localDateTimeString(now, timeZone: timeZone)),
            "tz": .string(timeZone.identifier),
            "tzOffsetMinutes": .number(Double(HealyxDate.jsTimezoneOffsetMinutes(now, timeZone: timeZone))),
        ]
    }

    public func makeRequest(path: String, body: [String: JSONValue], accessToken: String) throws -> URLRequest {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.timeoutInterval = 90
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try HealyxJSON.encoder.encode(body)
        return request
    }

    /// Turns a response into a value, or into the server's own error message.
    public static func decode<T: Decodable>(_ type: T.Type, data: Data, status: Int) throws -> T {
        if (200..<300).contains(status) {
            if let value = try? HealyxJSON.decoder.decode(T.self, from: data) { return value }
            throw HealyxAPIError.invalidResponse(status: status)
        }
        if let body = try? HealyxJSON.decoder.decode([String: JSONValue].self, from: data),
           let message = body["error"]?.string {
            throw HealyxAPIError.server(status: status, message: message)
        }
        if status == 401 { throw HealyxAPIError.notSignedIn }
        throw HealyxAPIError.invalidResponse(status: status)
    }

    // MARK: Calls

    private func post<T: Decodable>(_ path: String, body: [String: JSONValue], as type: T.Type) async throws -> T {
        let accessToken: String
        do { accessToken = try await token() } catch { throw HealyxAPIError.notSignedIn }
        let request = try makeRequest(path: path, body: body, accessToken: accessToken)
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        return try Self.decode(T.self, data: data, status: status)
    }

    private struct ChatReply: Decodable { let reply: String }

    /// The health guide chat (`POST /api/chat`). The server adds the person's saved records.
    public func chat(message: String, history: [ChatTurn], images: [ChatImage] = []) async throws -> String {
        try await post("api/chat", body: Self.chatBody(message: message, history: history, images: images), as: ChatReply.self).reply
    }

    /// The chat with everything the server returns (reply and any lab results read from photos).
    /// `voice` asks for a short spoken-style answer.
    public func chatResult(message: String, history: [ChatTurn], images: [ChatImage] = [], voice: Bool = false) async throws -> ChatResult {
        try await post("api/chat", body: Self.chatBody(message: message, history: history, images: images, voice: voice), as: ChatResult.self)
    }

    /// Natural speech for a short piece of text (`POST /api/tts`). Returns WAV audio.
    public func tts(text: String, voice: String? = nil) async throws -> Data {
        let accessToken: String
        do { accessToken = try await token() } catch { throw HealyxAPIError.notSignedIn }
        var body: [String: JSONValue] = ["text": .string(String(text.prefix(1200)))]
        if let voice { body["voice"] = .string(voice) }
        var request = try makeRequest(path: "api/tts", body: body, accessToken: accessToken)
        request.timeoutInterval = 30
        let (data, response) = try await session.data(for: request)
        let http = response as? HTTPURLResponse
        let status = http?.statusCode ?? 0
        let contentType = http?.value(forHTTPHeaderField: "Content-Type") ?? ""
        if (200..<300).contains(status) && contentType.contains("audio") && !data.isEmpty { return data }
        if (200..<300).contains(status) { throw HealyxAPIError.invalidResponse(status: status) }
        struct Empty: Decodable {}
        _ = try Self.decode(Empty.self, data: data, status: status)
        throw HealyxAPIError.invalidResponse(status: status)
    }

    /// Runs a health agent (`POST /api/agents/run`). The server streams each step as it
    /// works, then the final reply; it saves the exchange and any tasks.
    /// A crisis reply, and any error, come back as a single JSON object instead.
    public func runAgent(_ agent: AgentID, message: String, history: [ChatTurn],
                         now: Date = Date(), timeZone: TimeZone = .current,
                         onStep: @escaping @Sendable (AgentStep) async -> Void = { _ in }) async throws -> AgentRunResult {
        let accessToken: String
        do { accessToken = try await token() } catch { throw HealyxAPIError.notSignedIn }
        let body = Self.agentBody(agent: agent, message: message, history: history, now: now, timeZone: timeZone)
        var request = try makeRequest(path: "api/agents/run", body: body, accessToken: accessToken)
        request.timeoutInterval = 200 // the server allows a run up to 150 s
        request.setValue("application/x-ndjson, application/json", forHTTPHeaderField: "Accept")

        #if canImport(FoundationNetworking)
        // Linux (tests and tooling): no byte streaming, so read the whole body.
        let (data, response) = try await session.data(for: request)
        let http = response as? HTTPURLResponse
        return try await Self.agentResult(data: data, status: http?.statusCode ?? 0,
                                          contentType: http?.value(forHTTPHeaderField: "Content-Type") ?? "",
                                          onStep: onStep)
        #else
        let (bytes, response) = try await session.bytes(for: request)
        let http = response as? HTTPURLResponse
        let status = http?.statusCode ?? 0
        let contentType = http?.value(forHTTPHeaderField: "Content-Type") ?? ""
        if !(200..<300).contains(status) || contentType.contains("application/json") {
            var data = Data()
            for try await byte in bytes { data.append(byte) }
            return try Self.decode(AgentRunResult.self, data: data, status: status)
        }
        var result: AgentRunResult?
        for try await line in bytes.lines {
            switch AgentEvent.parse(line) {
            case .step(let step)?: await onStep(step)
            case .done(let done)?: result = done
            case .failed(let message)?: throw HealyxAPIError.server(status: status, message: message)
            case nil: continue
            }
        }
        guard let result else { throw HealyxAPIError.server(status: status, message: Self.stoppedEarly) }
        return result
        #endif
    }

    static let stoppedEarly = "The agent stopped before finishing. Please try again."

    /// Reads a complete agent response body: a JSON object or a newline-delimited stream.
    public static func agentResult(data: Data, status: Int, contentType: String,
                                   onStep: @Sendable (AgentStep) async -> Void = { _ in }) async throws -> AgentRunResult {
        if !(200..<300).contains(status) || contentType.contains("application/json") {
            return try decode(AgentRunResult.self, data: data, status: status)
        }
        var result: AgentRunResult?
        for line in String(decoding: data, as: UTF8.self).split(separator: "\n") {
            switch AgentEvent.parse(String(line)) {
            case .step(let step)?: await onStep(step)
            case .done(let done)?: result = done
            case .failed(let message)?: throw HealyxAPIError.server(status: status, message: message)
            case nil: continue
            }
        }
        guard let result else { throw HealyxAPIError.server(status: status, message: stoppedEarly) }
        return result
    }
}
