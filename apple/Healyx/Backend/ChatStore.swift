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
        /// Lab results the guide read from a photo, ready to save to Health Records.
        var labs: [HealyxAPI.ExtractedLab] = []
        var labsSaved = false
        /// Things from this reply that were saved to the account.
        var saves: [SavedItem] = []
    }

    /// One thing Ask Healyx saved (or tried to save) from what the person said.
    struct SavedItem: Identifiable, Hashable {
        enum State: Hashable { case saving, saved, undone, failed(String) }
        let id = UUID()
        let action: ChatAction
        var state: State = .saving
        var undo: ChatActionRunner.Undo?
        var title: String { action.summary() }
    }

    private(set) var messages: [Message] = []
    private(set) var isSending = false

    private let backend: HealyxBackend
    @ObservationIgnored private weak var records: RecordsStore?
    @ObservationIgnored private weak var wellness: WellnessStore?

    /// Lets saves refresh the record and the Home scores.
    func attach(records: RecordsStore, wellness: WellnessStore) {
        self.records = records
        self.wellness = wellness
    }

    init(backend: HealyxBackend = .shared) {
        self.backend = backend
    }

    /// Sends a message with up to three photos. Returns the reply text, or nil on failure.
    @discardableResult
    func send(_ text: String, images: [Data] = [], voice: Bool = false) async -> String? {
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
            let result = try await backend.api.chatResult(message: question, history: history, images: payload, voice: voice)
            var reply = Message(role: .assistant, text: result.reply, labs: result.extractedLabs)
            reply.saves = result.actions.map { SavedItem(action: $0) }
            messages.append(reply)
            if !reply.saves.isEmpty { await performSaves(in: reply.id) }
            return result.reply
        } catch {
            messages.append(Message(role: .assistant, text: error.localizedDescription, isError: true))
            return nil
        }
    }

    func reset() {
        messages = []
    }

    // MARK: Saving what the person said

    private func performSaves(in messageID: UUID) async {
        guard let index = messages.firstIndex(where: { $0.id == messageID }) else { return }
        for item in messages[index].saves where item.state == .saving {
            await perform(item.id, in: messageID)
        }
        await refreshAfterSave()
    }

    private func perform(_ itemID: UUID, in messageID: UUID) async {
        guard let m = messages.firstIndex(where: { $0.id == messageID }),
              let i = messages[m].saves.firstIndex(where: { $0.id == itemID }) else { return }
        let action = messages[m].saves[i].action
        messages[m].saves[i].state = .saving
        do {
            let undo = try await ChatActionRunner.perform(action, records: records)
            setSave(itemID, in: messageID) { $0.state = .saved; $0.undo = undo }
        } catch {
            let reason = (error as? LocalizedError)?.errorDescription ?? "Please try again."
            setSave(itemID, in: messageID) { $0.state = .failed(reason) }
        }
    }

    private func setSave(_ itemID: UUID, in messageID: UUID, _ change: (inout SavedItem) -> Void) {
        guard let m = messages.firstIndex(where: { $0.id == messageID }),
              let i = messages[m].saves.firstIndex(where: { $0.id == itemID }) else { return }
        change(&messages[m].saves[i])
    }

    /// Tries a failed save again.
    func retrySave(_ itemID: UUID, in messageID: UUID) async {
        await perform(itemID, in: messageID)
        await refreshAfterSave()
    }

    /// Takes a save back.
    func undoSave(_ itemID: UUID, in messageID: UUID) async {
        guard let m = messages.firstIndex(where: { $0.id == messageID }),
              let item = messages[m].saves.first(where: { $0.id == itemID }), let undo = item.undo else { return }
        do {
            try await ChatActionRunner.undo(undo)
            setSave(itemID, in: messageID) { $0.state = .undone; $0.undo = nil }
            await refreshAfterSave()
        } catch {
            setSave(itemID, in: messageID) { $0.state = .failed("Couldn't undo. Please try again.") }
        }
    }

    private func refreshAfterSave() async {
        await ManualLogStore.shared.load()
        await records?.reload()
        await wellness?.refresh()
    }

    /// Saves the numeric lab results read from a photo to Health Records.
    /// Returns how many were saved.
    @discardableResult
    func saveLabs(for messageID: UUID, records: RecordsStore) async throws -> Int {
        guard let index = messages.firstIndex(where: { $0.id == messageID }), !messages[index].labsSaved else { return 0 }
        guard let userID = records.currentUserID else { throw HealyxAPIError.notSignedIn }
        let today = HealyxDate.localDateString(Date())
        var saved = 0
        for lab in messages[index].labs {
            guard let value = lab.value else { continue }
            let input = BiomarkerInput(userID: userID, name: lab.name, value: value, unit: lab.unit ?? "",
                                       testDate: lab.date ?? today, referenceRangeText: lab.range)
            _ = try await backend.supabase.from("biomarkers").insert(input).execute()
            saved += 1
        }
        messages[index].labsSaved = true
        await records.reload()
        return saved
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
        case .records: return "heart.text.square.fill"
        case .agents: return "wand.and.sparkles"
        }
    }
}
