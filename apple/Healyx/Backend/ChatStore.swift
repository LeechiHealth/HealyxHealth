import Foundation
import Observation
import HealyxKit
#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// The Ask Healyx conversation. Like the website, the conversation lives for the
/// session only; the server adds the person's saved records to every question.
@MainActor
@Observable
final class ChatStore {
    struct Message: Identifiable, Hashable {
        let id = UUID()
        let role: ChatRole
        let text: String
        var images: [Data] = []
        var isError = false
    }

    private(set) var messages: [Message] = []
    private(set) var isSending = false

    private let backend: HealyxBackend

    init(backend: HealyxBackend = .shared) {
        self.backend = backend
    }

    /// Sends a message with up to three photos. Returns the reply text, or nil on failure.
    @discardableResult
    func send(_ text: String, images: [Data] = []) async -> String? {
        let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty || !images.isEmpty, !isSending else { return nil }
        let question = content.isEmpty ? "What can you tell me about this photo?" : content
        let history = messages.filter { !$0.isError }.map { ChatTurn(role: $0.role, content: $0.text) }
        let encoded = images.prefix(3).compactMap(Self.jpegForUpload)
        messages.append(Message(role: .user, text: question, images: encoded))
        isSending = true
        defer { isSending = false }
        do {
            let payload = encoded.map { HealyxAPI.ChatImage(base64: $0.base64EncodedString()) }
            let reply = try await backend.api.chat(message: question, history: history, images: payload)
            messages.append(Message(role: .assistant, text: reply))
            return reply
        } catch {
            messages.append(Message(role: .assistant, text: error.localizedDescription, isError: true))
            return nil
        }
    }

    func reset() {
        messages = []
    }

    /// Re-encodes a photo as JPEG, shrinking it until it's about 1 MB or less.
    static func jpegForUpload(_ data: Data) -> Data? {
        let limit = 1_000_000
        #if os(iOS)
        guard var image = UIImage(data: data) else { return nil }
        let longest = max(image.size.width, image.size.height)
        if longest > 2048 {
            let scale = 2048 / longest
            let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            let source = image
            image = UIGraphicsImageRenderer(size: size).image { _ in source.draw(in: CGRect(origin: .zero, size: size)) }
        }
        for quality in [0.8, 0.6, 0.45, 0.3] {
            if let jpeg = image.jpegData(compressionQuality: quality), jpeg.count <= limit { return jpeg }
        }
        return image.jpegData(compressionQuality: 0.2)
        #else
        guard let image = NSImage(data: data) else { return nil }
        var rect = CGRect(origin: .zero, size: image.size)
        guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else { return nil }
        var rep = NSBitmapImageRep(cgImage: cgImage)
        let longest = max(rep.pixelsWide, rep.pixelsHigh)
        if longest > 2048 {
            let scale = 2048 / CGFloat(longest)
            let width = Int(CGFloat(rep.pixelsWide) * scale)
            let height = Int(CGFloat(rep.pixelsHigh) * scale)
            if let resized = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
                                              bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                              colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) {
                NSGraphicsContext.saveGraphicsState()
                NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: resized)
                NSImage(cgImage: cgImage, size: .zero).draw(in: CGRect(x: 0, y: 0, width: width, height: height))
                NSGraphicsContext.restoreGraphicsState()
                rep = resized
            }
        }
        for quality in [0.8, 0.6, 0.45, 0.3] {
            if let jpeg = rep.representation(using: .jpeg, properties: [.compressionFactor: quality]), jpeg.count <= limit {
                return jpeg
            }
        }
        return rep.representation(using: .jpeg, properties: [.compressionFactor: 0.2])
        #endif
    }
}

/// Which section is showing, plus cross-section actions like "ask Healyx about this".
@MainActor
@Observable
final class AppRouter {
    /// The app opens on Ask Healyx.
    var section: AppSection = .guide
    /// A question waiting to be sent when the chat opens.
    var pendingQuestion: String?

    func ask(_ question: String) {
        pendingQuestion = question
        section = .guide
    }
}

enum AppSection: String, CaseIterable, Identifiable, Hashable {
    case home, guide, records, agents

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: return "Home"
        case .guide: return "Ask Healyx"
        case .records: return "Health Records"
        case .agents: return "Agents"
        }
    }

    var shortTitle: String { title }

    var symbol: String {
        switch self {
        case .home: return "house.fill"
        case .guide: return "sparkles"
        case .records: return "heart.text.square"
        case .agents: return "person.2"
        }
    }
}
