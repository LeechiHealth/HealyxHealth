import Foundation
import Observation
import HealyxKit
import Supabase
#if os(iOS) && canImport(HealthKit)
import HealthKit
#endif

/// Sleep, recovery, stress and nutrition scores from Apple Health.
/// Health data is read on this iPhone and never leaves it; nothing is written to Health.
@MainActor
@Observable
final class WellnessStore {
    private(set) var snapshot: WellnessSnapshot?
    private(set) var isLoading = false
    var errorMessage: String?

    private static let connectedKey = "health.connected"
    private static let authVersionKey = "health.authVersion"
    private static let authVersion = 3

    private(set) var connected: Bool

    /// Biological age from labs (PhenoAge, or KDM with fewer labs). Call `updateBiologicalAge(records:)` after records load.
    private(set) var biologicalAge: BiologicalAgeResult?

    init() {
        connected = UserDefaults.standard.bool(forKey: Self.connectedKey)
    }

    /// True when this device has Apple Health (iPhone; not the Mac).
    var isAvailable: Bool {
        #if os(iOS) && canImport(HealthKit)
        return HKHealthStore.isHealthDataAvailable()
        #else
        return false
        #endif
    }

    /// The day of the synced row shown on a device without Apple Health (the Mac).
    private(set) var syncedDay: String?

    /// True when there is something to load: Health is connected here, or this
    /// device shows the scores the iPhone synced.
    /// Always true now: manual logs feed the scores even without Apple Health.
    var shouldRefresh: Bool { true }

    /// Recomputes biological age from the saved labs and date of birth.
    func updateBiologicalAge(records: RecordsStore) {
        let vital = records.vitals.first { $0.systolicBP != nil }
        let fromVitals = vital.flatMap { v in v.systolicBP.map { SystolicReading(value: $0, date: v.recordedAt) } }
        bioInputs = (records.biomarkers, records.profile?.dateOfBirth, BiologicalSex(profileValue: records.profile?.gender), fromVitals)
        recomputeBiologicalAge()
    }

    func updateBiologicalAge(biomarkers: [Biomarker], dateOfBirth: String?) {
        bioInputs = (biomarkers, dateOfBirth, bioInputs?.sex, bioInputs?.systolic)
        recomputeBiologicalAge()
    }

    /// Latest labs, birth date, sex and vitals systolic, kept so an Apple Health
    /// blood pressure reading can update the estimate later.
    @ObservationIgnored private var bioInputs: (biomarkers: [Biomarker], dateOfBirth: String?, sex: BiologicalSex?, systolic: SystolicReading?)?
    /// Newest systolic blood pressure from Apple Health (last year).
    @ObservationIgnored private var healthSystolic: SystolicReading?

    private func recomputeBiologicalAge() {
        guard let inputs = bioInputs, !inputs.biomarkers.isEmpty || inputs.dateOfBirth != nil else {
            biologicalAge = nil
            return
        }
        // Use whichever systolic reading is newer: logged vitals or Apple Health.
        let readings = [inputs.systolic, healthSystolic].compactMap { $0 }
        let systolic = readings.max { ($0.date ?? "") < ($1.date ?? "") }
        biologicalAge = BiologicalAge.evaluate(biomarkers: inputs.biomarkers, dateOfBirth: inputs.dateOfBirth,
                                               sex: inputs.sex, systolic: systolic)
    }

    func reset() {
        snapshot = nil
        biologicalAge = nil
        syncedDay = nil
        errorMessage = nil
        isLoading = false
        ManualLogStore.shared.reset()
    }

    /// Scores from manual logs alone (an iPhone without Apple Health connected).
    private func computeManualOnly() async {
        let entries = ManualLogStore.shared.entries
        guard !entries.isEmpty else { return }
        snapshot = ManualWellness.fill(nil, entries: entries, now: Date(), calendar: .current)
        if let snapshot { await upload(snapshot) }
    }

    private var backend: HealyxBackend { .shared }

    private func currentUserID() async -> String? {
        guard let session = try? await backend.supabase.auth.session else { return nil }
        return session.user.id.uuidString.lowercased()
    }

    /// Saves today's scores to the account so the Mac can show them. Failures are
    /// quiet: the iPhone card still works without the sync.
    private func upload(_ snapshot: WellnessSnapshot) async {
        guard !snapshot.isEmpty, let userID = await currentUserID() else { return }
        let row = WellnessDailyRow(snapshot: snapshot, userID: userID)
        do {
            _ = try await backend.supabase.from("wellness_daily")
                .upsert(row, onConflict: "user_id,day")
                .execute()
        } catch {
            print("Healyx: wellness sync failed: \(error)")
        }
    }

    /// Loads the latest scores the iPhone synced (used on the Mac).
    private func loadSynced() async {
        guard !isLoading, let userID = await currentUserID() else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let data = try await backend.supabase.from("wellness_daily").select()
                .eq("user_id", value: userID)
                .order("day", ascending: false).limit(1)
                .execute().data
            let rows = try HealyxJSON.decoder.decode([WellnessDailyRow].self, from: data)
            snapshot = ManualWellness.fill(rows.first?.snapshot, entries: ManualLogStore.shared.entries,
                                           now: Date(), calendar: .current)
            syncedDay = rows.first?.day
            errorMessage = nil
        } catch {
            snapshot = ManualWellness.fill(nil, entries: ManualLogStore.shared.entries, now: Date(), calendar: .current)
            syncedDay = nil
        }
    }

    #if os(iOS) && canImport(HealthKit)
    @ObservationIgnored private let healthStore = HKHealthStore()

    private var readTypes: Set<HKObjectType> {
        [
            HKCategoryType(.sleepAnalysis),
            HKQuantityType(.heartRateVariabilitySDNN),
            HKQuantityType(.restingHeartRate),
            HKQuantityType(.heartRate),
            HKObjectType.workoutType(),
            HKQuantityType(.dietaryEnergyConsumed),
            HKQuantityType(.dietaryProtein),
            HKQuantityType(.dietaryCarbohydrates),
            HKQuantityType(.dietaryFatTotal),
            HKQuantityType(.dietaryFiber),
            HKQuantityType(.dietaryWater),
            HKQuantityType(.bloodPressureSystolic),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.basalEnergyBurned),
        ]
    }
    #endif

    /// Asks for read access to Apple Health, then loads today's scores.
    func connect() async {
        #if os(iOS) && canImport(HealthKit)
        guard isAvailable else {
            errorMessage = "Apple Health isn't available on this device."
            return
        }
        do {
            try await healthStore.requestAuthorization(toShare: [], read: readTypes)
            connected = true
            UserDefaults.standard.set(true, forKey: Self.connectedKey)
            UserDefaults.standard.set(Self.authVersion, forKey: Self.authVersionKey)
            await refresh()
        } catch {
            errorMessage = "Healyx couldn't connect to Apple Health. Please try again."
        }
        #else
        errorMessage = "Apple Health scores are available on your iPhone."
        #endif
    }

    /// Reads the latest Health data and recomputes the scores.
    func refresh() async {
        await ManualLogStore.shared.loadIfNeeded()
        guard isAvailable else {
            await loadSynced()
            return
        }
        #if os(iOS) && canImport(HealthKit)
        guard connected else {
            await computeManualOnly()
            return
        }
        guard !isLoading else { return }
        // Ask again once when a new version reads more types (energy burned);
        // Health only shows the sheet for types not decided yet.
        if UserDefaults.standard.integer(forKey: Self.authVersionKey) < Self.authVersion {
            try? await healthStore.requestAuthorization(toShare: [], read: readTypes)
            UserDefaults.standard.set(Self.authVersion, forKey: Self.authVersionKey)
        }
        isLoading = true
        var computed: WellnessSnapshot?
        do {
            let manual = ManualLogStore.shared.entries
            let input = ManualWellness.merge(try await readInput(now: Date()), entries: manual)
            let result = ManualWellness.applyStress(WellnessScoring.compute(input), entries: manual,
                                                    now: input.now, calendar: input.calendar)
            snapshot = result
            computed = result
            errorMessage = nil
        } catch {
            errorMessage = "Healyx couldn't read Apple Health right now. Pull to refresh and try again."
        }
        isLoading = false
        await loadHealthSystolic()
        if let computed { await upload(computed) }
        #endif
    }

    #if os(iOS) && canImport(HealthKit)
    private func readInput(now: Date) async throws -> WellnessInput {
        let calendar = Calendar.current
        let startOfToday = calendar.startOfDay(for: now)
        let sleepStart = calendar.date(byAdding: .hour, value: -6, to: startOfToday) ?? startOfToday
        let historyStart = calendar.date(byAdding: .day, value: -31, to: startOfToday) ?? startOfToday

        let ms = HKUnit.secondUnit(with: .milli)
        let bpm = HKUnit.count().unitDivided(by: .minute())

        async let sleep = sleepSegments(from: sleepStart, to: now)
        async let hrv = values(.heartRateVariabilitySDNN, unit: ms, from: historyStart, to: now)
        async let resting = values(.restingHeartRate, unit: bpm, from: historyStart, to: now)
        async let heartRate = values(.heartRate, unit: bpm, from: startOfToday, to: now)
        async let workouts = workoutIntervals(from: startOfToday, to: now)
        async let nutrition = nutritionTotals(from: startOfToday, to: now)

        return WellnessInput(
            now: now,
            calendar: calendar,
            sleep: try await sleep,
            hrv: try await hrv,
            restingHR: try await resting,
            heartRate: try await heartRate,
            workouts: try await workouts,
            nutrition: try await nutrition
        )
    }

    /// Newest systolic reading from the last year, for the biological age estimate.
    private func loadHealthSystolic() async {
        let now = Date()
        let start = Calendar.current.date(byAdding: .day, value: -365, to: now) ?? now
        guard let samples = try? await quantitySamples(.bloodPressureSystolic, from: start, to: now),
              let newest = samples.max(by: { $0.startDate < $1.startDate }) else { return }
        let value = newest.quantity.doubleValue(for: .millimeterOfMercury())
        healthSystolic = SystolicReading(value: value, date: HealyxDate.isoTimestamp(newest.startDate))
        recomputeBiologicalAge()
    }

    private func predicate(from start: Date, to end: Date) -> NSPredicate {
        HKQuery.predicateForSamples(withStart: start, end: end, options: [])
    }

    private func sleepSegments(from start: Date, to end: Date) async throws -> [SleepSegment] {
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.categorySample(type: HKCategoryType(.sleepAnalysis), predicate: predicate(from: start, to: end))],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        let samples = try await descriptor.result(for: healthStore)
        return samples.compactMap { sample in
            let stage: SleepStage
            switch sample.value {
            case 0: stage = .inBed
            case 1: stage = .unspecified
            case 2: stage = .awake
            case 3: stage = .core
            case 4: stage = .deep
            case 5: stage = .rem
            default: return nil
            }
            return SleepSegment(start: sample.startDate, end: sample.endDate, stage: stage)
        }
    }

    private func quantitySamples(_ identifier: HKQuantityTypeIdentifier, from start: Date, to end: Date) async throws -> [HKQuantitySample] {
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: HKQuantityType(identifier), predicate: predicate(from: start, to: end))],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        return try await descriptor.result(for: healthStore)
    }

    private func values(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, from start: Date, to end: Date) async throws -> [TimedValue] {
        try await quantitySamples(identifier, from: start, to: end).map { sample in
            TimedValue(date: sample.startDate, value: sample.quantity.doubleValue(for: unit))
        }
    }

    /// Total logged today, or nil when nothing was logged.
    private func total(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, from start: Date, to end: Date) async throws -> Double? {
        let samples = try await quantitySamples(identifier, from: start, to: end)
        guard !samples.isEmpty else { return nil }
        return samples.reduce(0) { $0 + $1.quantity.doubleValue(for: unit) }
    }

    private func workoutIntervals(from start: Date, to end: Date) async throws -> [TimeInterval2] {
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.workout(predicate(from: start, to: end))],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        return try await descriptor.result(for: healthStore).map { TimeInterval2(start: $0.startDate, end: $0.endDate) }
    }

    private func nutritionTotals(from start: Date, to end: Date) async throws -> NutritionTotals {
        let gram = HKUnit.gram()
        return NutritionTotals(
            energyKcal: try await total(.dietaryEnergyConsumed, unit: .kilocalorie(), from: start, to: end),
            proteinG: try await total(.dietaryProtein, unit: gram, from: start, to: end),
            carbsG: try await total(.dietaryCarbohydrates, unit: gram, from: start, to: end),
            fatG: try await total(.dietaryFatTotal, unit: gram, from: start, to: end),
            fiberG: try await total(.dietaryFiber, unit: gram, from: start, to: end),
            waterML: try await total(.dietaryWater, unit: HKUnit.literUnit(with: .milli), from: start, to: end),
            activeKcal: try await total(.activeEnergyBurned, unit: .kilocalorie(), from: start, to: end),
            basalKcal: try await total(.basalEnergyBurned, unit: .kilocalorie(), from: start, to: end)
        )
    }
    #endif
}
