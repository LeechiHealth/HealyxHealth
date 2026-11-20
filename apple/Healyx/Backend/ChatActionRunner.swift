import Foundation
import Supabase
import HealyxKit

/// Saves what the person tells Ask Healyx to their own account (row-level
/// security, their session), and can undo each save.
@MainActor
enum ChatActionRunner {
    /// How to take a save back.
    enum Undo: Hashable, Sendable {
        case deleteRow(table: String, id: String)
        case reactivateMedication(id: String, previousStatus: String, previousEndDate: String?)
    }

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    private struct InsertedRow: Decodable { let id: String }

    private static var db: SupabaseClient { HealyxBackend.shared.supabase }

    private static func userID() async throws -> String {
        guard let session = try? await db.auth.session else { throw HealyxAPIError.notSignedIn }
        return session.user.id.uuidString.lowercased()
    }

    /// Inserts a row and returns its id, so the save can be undone.
    private static func insert<T: Encodable & Sendable>(_ row: T, into table: String) async throws -> String {
        let data = try await db.from(table).insert(row).select("id").single().execute().data
        return try HealyxJSON.decoder.decode(InsertedRow.self, from: data).id
    }

    /// Saves one action. Returns how to undo it.
    static func perform(_ action: ChatAction, records: RecordsStore?) async throws -> Undo {
        let user = try await userID()
        let now = Date()
        switch action {
        case let .sleep(bed, wake, latency, wakeUps, awake, quality):
            let log = ManualSleepLog(bedtime: bed, wakeTime: wake, minutesToFallAsleep: latency, wakeUps: wakeUps,
                                     minutesAwake: awake, quality: quality, notes: "Saved from Ask Healyx")
            return .deleteRow(table: "wellness_manual", id: try await insert(log.insert(userID: user), into: "wellness_manual"))

        case let .stress(rating):
            let row = ManualLogInsert(userID: user, kind: .stress, loggedAt: now, value: Double(rating))
            return .deleteRow(table: "wellness_manual", id: try await insert(row, into: "wellness_manual"))

        case let .meal(name, kcal, protein, carbs, fat, fiber):
            var details: [String: JSONValue] = ["name": .string(name)]
            if let protein { details["protein"] = .number(protein) }
            if let carbs { details["carbs"] = .number(carbs) }
            if let fat { details["fat"] = .number(fat) }
            if let fiber { details["fiber"] = .number(fiber) }
            let row = ManualLogInsert(userID: user, kind: .meal, loggedAt: now, value: kcal, details: details)
            return .deleteRow(table: "wellness_manual", id: try await insert(row, into: "wellness_manual"))

        case let .water(ml):
            let row = ManualLogInsert(userID: user, kind: .water, loggedAt: now, value: ml)
            return .deleteRow(table: "wellness_manual", id: try await insert(row, into: "wellness_manual"))

        case let .vital(kind, value, value2):
            switch kind {
            case .restingHR:
                let row = ManualLogInsert(userID: user, kind: .restingHR, loggedAt: now, value: value)
                return .deleteRow(table: "wellness_manual", id: try await insert(row, into: "wellness_manual"))
            case .hrv:
                let row = ManualLogInsert(userID: user, kind: .hrv, loggedAt: now, value: value)
                return .deleteRow(table: "wellness_manual", id: try await insert(row, into: "wellness_manual"))
            case .weight, .bloodPressure, .temperature:
                let vitalKind: VitalKind = kind == .weight ? .weight : kind == .bloodPressure ? .bloodPressure : .temperature
                guard vitalKind.range.contains(value) else {
                    throw Failure(message: "That \(vitalKind.rawValue.lowercased()) looks out of range.")
                }
                let row = vitalKind.input(userID: user, recordedAt: now, value: value, secondValue: value2)
                return .deleteRow(table: "vitals", id: try await insert(row, into: "vitals"))
            }

        case let .addMedication(name, dose, frequency, startedOn):
            let row = MedicationInput(userID: user, name: name, dosage: dose, frequency: frequency,
                                      startDate: startedOn ?? HealyxDate.localDateString(now),
                                      notes: "Added from Ask Healyx")
            return .deleteRow(table: "medications", id: try await insert(row, into: "medications"))

        case let .stopMedication(name):
            let target = name.lowercased()
            guard let medication = records?.activeMedications.first(where: {
                $0.name.lowercased() == target || $0.name.lowercased().contains(target) || target.contains($0.name.lowercased())
            }) else {
                throw Failure(message: "No active medication named \(name) is in your records.")
            }
            let today = HealyxDate.localDateString(now)
            let update: [String: JSONValue] = ["status": .string("discontinued"), "end_date": .string(today)]
            _ = try await db.from("medications").update(update)
                .eq("id", value: medication.id).eq("user_id", value: user).execute()
            return .reactivateMedication(id: medication.id, previousStatus: medication.status ?? "active",
                                         previousEndDate: medication.endDate)

        case let .addCondition(name, diagnosedOn):
            let row = ConditionInput(userID: user, name: name, diagnosedDate: diagnosedOn, notes: "Added from Ask Healyx")
            return .deleteRow(table: "conditions", id: try await insert(row, into: "conditions"))

        case let .addLab(name, value, _, unit, range, date):
            guard let value else { throw Failure(message: "\(name) has no number to save.") }
            let row = BiomarkerInput(userID: user, name: name, value: value, unit: unit ?? "",
                                     testDate: date ?? HealyxDate.localDateString(now), referenceRangeText: range)
            return .deleteRow(table: "biomarkers", id: try await insert(row, into: "biomarkers"))
        }
    }

    /// Takes a save back.
    static func undo(_ undo: Undo) async throws {
        let user = try await userID()
        switch undo {
        case let .deleteRow(table, id):
            _ = try await db.from(table).delete().eq("id", value: id).eq("user_id", value: user).execute()
        case let .reactivateMedication(id, status, endDate):
            let update: [String: JSONValue] = ["status": .string(status), "end_date": endDate.map { .string($0) } ?? .null]
            _ = try await db.from("medications").update(update).eq("id", value: id).eq("user_id", value: user).execute()
        }
    }
}
