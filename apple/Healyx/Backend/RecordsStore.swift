import Foundation
import Observation
import Supabase
import HealyxKit

/// The person's health record: vitals, labs, conditions, medications, profile.
/// Reads and writes go straight to Supabase as the signed-in user, so the same
/// row-level security that protects the website protects the app.
@MainActor
@Observable
final class RecordsStore {
    private(set) var vitals: [Vital] = []
    private(set) var biomarkers: [Biomarker] = []
    private(set) var conditions: [Condition] = []
    private(set) var medications: [Medication] = []
    private(set) var profile: Profile?
    private(set) var intake: IntakeSnapshot?
    private(set) var isLoading = false
    private(set) var hasLoaded = false
    var errorMessage: String?

    private(set) var brief: HealthBrief = .empty
    private(set) var score: HealthScore = HealthScoring.compute(HealthInputs())

    private let backend: HealyxBackend
    private var userID: String?

    init(backend: HealyxBackend = .shared) {
        self.backend = backend
    }

    // MARK: Loading

    func load(userID: String) async {
        self.userID = userID
        isLoading = true
        errorMessage = nil
        defer {
            isLoading = false
            hasLoaded = true
        }
        let db = backend.supabase
        let decoder = HealyxJSON.decoder
        do {
            async let vitalsData = db.from("vitals").select()
                .eq("user_id", value: userID)
                .order("recorded_at", ascending: false).limit(200)
                .execute().data
            async let labsData = db.from("biomarkers").select()
                .eq("user_id", value: userID)
                .order("test_date", ascending: false).limit(1000)
                .execute().data
            async let conditionsData = db.from("conditions").select()
                .eq("user_id", value: userID)
                .execute().data
            async let medicationsData = db.from("medications").select()
                .eq("user_id", value: userID)
                .execute().data
            async let profileData = db.from("profiles")
                .select("id, full_name, date_of_birth, gender, height_inches, weight_lbs, blood_type")
                .eq("id", value: userID).limit(1)
                .execute().data

            vitals = try decoder.decode([Vital].self, from: try await vitalsData)
            biomarkers = try decoder.decode([Biomarker].self, from: try await labsData)
            conditions = try decoder.decode([Condition].self, from: try await conditionsData)
                .sorted { ($0.status ?? "active", $0.name) < ($1.status ?? "active", $1.name) }
            medications = try decoder.decode([Medication].self, from: try await medicationsData)
                .sorted { ($0.isActive ? 0 : 1, $0.name) < ($1.isActive ? 0 : 1, $1.name) }
            profile = try decoder.decode([Profile].self, from: try await profileData).first
        } catch {
            errorMessage = "Your records couldn't be loaded. Pull to refresh and try again."
        }

        // The intake questionnaire only feeds the optional score; a failure here
        // must not hide the rest of the record.
        if let data = try? await db.from("intake_responses")
            .select("sleep_hours, nicotine, completed_at")
            .eq("user_id", value: userID).eq("completed", value: "true")
            .order("completed_at", ascending: false).limit(1)
            .execute().data {
            intake = (try? decoder.decode([IntakeSnapshot].self, from: data))?.first
        }
        recompute()
    }

    func reload() async {
        guard let userID else { return }
        await load(userID: userID)
    }

    func reset() {
        vitals = []; biomarkers = []; conditions = []; medications = []
        profile = nil; intake = nil; userID = nil; hasLoaded = false; errorMessage = nil
        recompute()
    }

    private func recompute() {
        brief = HealthBriefBuilder.build(biomarkers)
        score = HealthScoreBuilder.build(biomarkers: biomarkers, vitals: vitals, profile: profile, intake: intake)
    }

    // MARK: Derived values

    var activeMedications: [Medication] { medications.filter(\.isActive) }

    var activeConditions: [Condition] {
        conditions.filter { ($0.status ?? "active").lowercased() == "active" }
    }

    var latestBloodPressure: Vital? {
        vitals.first { $0.systolicBP != nil && $0.diastolicBP != nil }
    }

    var latestWeight: Vital? { vitals.first { $0.weightKg != nil } }

    func history(forLab name: String) -> [Biomarker] {
        let key = name.lowercased().split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        return biomarkers
            .filter { $0.name.lowercased().split(whereSeparator: { $0.isWhitespace }).joined(separator: " ") == key }
            .sorted { ($0.testDate ?? "") > ($1.testDate ?? "") }
    }

    // MARK: Writes

    private func requireUser() throws -> String {
        guard let userID else { throw HealyxAPIError.notSignedIn }
        return userID
    }

    var currentUserID: String? { userID }

    func addVital(_ input: VitalInput) async throws {
        _ = try await backend.supabase.from("vitals").insert(input).execute()
        await reload()
    }

    func addBiomarker(_ input: BiomarkerInput) async throws {
        _ = try await backend.supabase.from("biomarkers").insert(input).execute()
        await reload()
    }

    func saveCondition(_ input: ConditionInput, id: String?) async throws {
        let userID = try requireUser()
        if let id {
            _ = try await backend.supabase.from("conditions").update(input)
                .eq("id", value: id).eq("user_id", value: userID).execute()
        } else {
            var row = input
            row.userID = userID
            _ = try await backend.supabase.from("conditions").insert(row).execute()
        }
        await reload()
    }

    func saveMedication(_ input: MedicationInput, id: String?) async throws {
        let userID = try requireUser()
        if let id {
            _ = try await backend.supabase.from("medications").update(input)
                .eq("id", value: id).eq("user_id", value: userID).execute()
        } else {
            var row = input
            row.userID = userID
            _ = try await backend.supabase.from("medications").insert(row).execute()
        }
        await reload()
    }

    enum Table: String { case vitals, biomarkers, conditions, medications }

    /// Deletes a row the person owns. Returns false if it is still there afterwards
    /// (for example when the table has no delete policy).
    @discardableResult
    func delete(_ id: String, from table: Table) async -> Bool {
        guard let userID else { return false }
        do {
            _ = try await backend.supabase.from(table.rawValue).delete()
                .eq("id", value: id).eq("user_id", value: userID).execute()
        } catch {
            errorMessage = "That couldn't be deleted. Please try again."
            return false
        }
        await reload()
        let stillThere: Bool
        switch table {
        case .vitals: stillThere = vitals.contains { $0.id == id }
        case .biomarkers: stillThere = biomarkers.contains { $0.id == id }
        case .conditions: stillThere = conditions.contains { $0.id == id }
        case .medications: stillThere = medications.contains { $0.id == id }
        }
        if stillThere { errorMessage = "Healyx doesn't allow deleting this kind of record yet." }
        return !stillThere
    }
}
