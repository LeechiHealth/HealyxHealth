import Foundation
import Observation
import Supabase
import HealyxKit

/// Sleep, heart rate, HRV, stress, meals and water entered by hand. Saved to the
/// `wellness_manual` table and merged into the same scores as Apple Health.
@MainActor
@Observable
final class ManualLogStore {
    static let shared = ManualLogStore()

    private(set) var entries: [ManualLogEntry] = []
    private(set) var hasLoaded = false
    var errorMessage: String?

    @ObservationIgnored private var loadedFor: String?

    /// How far back entries are loaded (the scores use up to 30 days of history).
    static let historyDays = 31

    private var backend: HealyxBackend { .shared }

    private func userID() async -> String? {
        guard let session = try? await backend.supabase.auth.session else { return nil }
        return session.user.id.uuidString.lowercased()
    }

    func entries(_ kinds: Set<ManualLogKind>) -> [ManualLogEntry] {
        entries.filter { kinds.contains($0.kind) }
    }

    /// The sleep log that ended on the morning of `day` (the night before it), if any.
    func sleepLog(endingOn day: Date, calendar: Calendar = .current) -> ManualLogEntry? {
        entries.first { entry in
            guard let log = ManualSleepLog(entry: entry) else { return false }
            return calendar.isDate(log.wakeTime, inSameDayAs: day)
        }
    }

    func loadIfNeeded() async {
        guard let id = await userID() else { return }
        if loadedFor == id { return }
        await load()
    }

    func load() async {
        guard let id = await userID() else { return }
        let since = Calendar.current.date(byAdding: .day, value: -Self.historyDays, to: Date()) ?? Date()
        do {
            let data = try await backend.supabase.from("wellness_manual").select()
                .eq("user_id", value: id)
                .gte("logged_at", value: HealyxDate.isoTimestamp(since))
                .order("logged_at", ascending: false)
                .limit(500)
                .execute().data
            entries = try HealyxJSON.decoder.decode([ManualLogEntry].self, from: data)
            loadedFor = id
            hasLoaded = true
            errorMessage = nil
        } catch {
            // The table may not exist yet; manual logging simply stays empty.
            hasLoaded = true
            loadedFor = id
            print("Healyx: manual logs failed to load: \(error)")
        }
    }

    /// Adds a log entry.
    func add(kind: ManualLogKind, at date: Date, value: Double?, value2: Double? = nil,
             details: [String: JSONValue] = [:]) async throws {
        guard let id = await userID() else { throw HealyxAPIError.notSignedIn }
        let row = ManualLogInsert(userID: id, kind: kind, loggedAt: date, value: value, value2: value2, details: details)
        _ = try await backend.supabase.from("wellness_manual").insert(row).execute()
        await load()
    }

    /// Saves a night of sleep, replacing an earlier entry when `replacing` is set.
    func save(sleep: ManualSleepLog, replacing existingID: String?) async throws {
        guard let id = await userID() else { throw HealyxAPIError.notSignedIn }
        let row = sleep.insert(userID: id)
        if let existingID {
            _ = try await backend.supabase.from("wellness_manual").update(row)
                .eq("id", value: existingID).eq("user_id", value: id).execute()
        } else {
            _ = try await backend.supabase.from("wellness_manual").insert(row).execute()
        }
        await load()
    }

    func delete(_ entry: ManualLogEntry) async {
        guard let id = await userID() else { return }
        do {
            _ = try await backend.supabase.from("wellness_manual").delete()
                .eq("id", value: entry.id).eq("user_id", value: id).execute()
            entries.removeAll { $0.id == entry.id }
        } catch {
            errorMessage = "That entry couldn't be deleted. Please try again."
        }
    }

    func reset() {
        entries = []
        hasLoaded = false
        loadedFor = nil
        errorMessage = nil
    }
}
