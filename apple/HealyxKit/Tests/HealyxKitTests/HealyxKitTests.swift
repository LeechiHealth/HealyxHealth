import XCTest
@testable import HealyxKit

final class HealthScoreTests: XCTestCase {
    let now = HealyxDate.timestamp("2026-11-09T12:00:00Z")!

    func testBandsMatchWeb() {
        XCTAssertEqual(HealthScoring.bloodPressure(118, 76), 100)
        XCTAssertEqual(HealthScoring.bloodPressure(125, 70), 75)
        XCTAssertEqual(HealthScoring.bloodPressure(118, 85), 50, "the more severe reading sets the band")
        XCTAssertEqual(HealthScoring.bloodPressure(150, 95), 25)
        XCTAssertNil(HealthScoring.bloodPressure(80, 90), "systolic must exceed diastolic")
        XCTAssertEqual(HealthScoring.bmi(24.9), 100)
        XCTAssertEqual(HealthScoring.bmi(31), 30)
        XCTAssertEqual(HealthScoring.glucose(hba1c: 5.8, fasting: 90), 60, "HbA1c wins over fasting glucose")
        XCTAssertEqual(HealthScoring.glucose(hba1c: nil, fasting: 130), 40)
        XCTAssertEqual(HealthScoring.lipids(nonHDL: 129), 100)
        XCTAssertEqual(HealthScoring.sleep(6.5), 70)
        XCTAssertEqual(HealthScoring.nicotine(" Never "), 100)
        XCTAssertNil(HealthScoring.nicotine("not a current smoker"))
    }

    func testComputeAveragesAvailableFactors() {
        let result = HealthScoring.compute(HealthInputs(bmi: 27, systolic: 118, diastolic: 76, nicotine: "never"))
        // (70 + 100 + 100) / 3 = 90
        XCTAssertEqual(result.score, 90)
        XCTAssertEqual(result.measured, 3)
        XCTAssertEqual(result.total, 7)
        XCTAssertEqual(result.grade, "Higher range")
        XCTAssertTrue(result.weakest.isEmpty)
    }

    func testEmptyInputsHaveNoScore() {
        let result = HealthScoring.compute(HealthInputs())
        XCTAssertEqual(result.score, 0)
        XCTAssertEqual(result.grade, "Not enough data")
    }

    func testBuilderUsesPairedBloodPressureAndSameDayLipids() {
        let vitals = [
            Vital(id: "3", recordedAt: "2026-11-01T10:00:00.123456+00:00", heartRate: 70),
            Vital(id: "2", recordedAt: "2026-10-20T10:00:00+00:00", systolicBP: 132, diastolicBP: 84),
            Vital(id: "1", recordedAt: "2030-01-01T10:00:00+00:00", systolicBP: 110, diastolicBP: 70), // future: ignored
        ]
        let labs = [
            Biomarker(id: "a", name: "Total Cholesterol", value: 200, unit: "mg/dL", testDate: "2026-09-01"),
            Biomarker(id: "b", name: "HDL", value: 50, unit: "mg/dL", testDate: "2026-09-01"),
            Biomarker(id: "c", name: "HbA1c", value: 5.4, unit: "%", testDate: "2026-09-01"),
        ]
        let profile = Profile(id: "u", heightInches: 70, weightLbs: 180)
        let intake = IntakeSnapshot(sleepHours: 7.5, nicotine: "never", completedAt: "2026-08-01T00:00:00+00:00")
        let result = HealthScoreBuilder.build(biomarkers: labs, vitals: vitals, profile: profile, intake: intake, now: now)

        func score(_ key: String) -> Int? { result.components.first { $0.key == key }?.score }
        XCTAssertEqual(score("bp"), 50)          // 132/84
        XCTAssertEqual(score("lipids"), 60)      // non-HDL 150
        XCTAssertEqual(score("glucose"), 100)    // HbA1c 5.4
        XCTAssertEqual(score("bmi"), 70)         // 703 * 180 / 4900 = 25.8
        XCTAssertEqual(score("sleep"), 100)
        XCTAssertEqual(score("nicotine"), 100)
        XCTAssertNil(score("activity"))
        XCTAssertEqual(result.provenance["bp"]?.date, "2026-10-20")
        XCTAssertEqual(result.score, 80)         // (50+60+100+70+100+100)/6 = 80
    }

    func testConflictingSameDayLabsAreExcluded() {
        let labs = [
            Biomarker(id: "a", name: "Total Cholesterol", value: 200, unit: "mg/dL", testDate: "2026-09-01"),
            Biomarker(id: "b", name: "total  cholesterol", value: 210, unit: "mg/dL", testDate: "2026-09-01"),
            Biomarker(id: "c", name: "HDL", value: 50, unit: "mg/dL", testDate: "2026-09-01"),
            Biomarker(id: "d", name: "HbA1c", value: 40, unit: "mmol/mol", testDate: "2026-09-01"),
        ]
        let prepared = ScoringLabPreparer.prepare(labs, now: now)
        XCTAssertNil(prepared.nonHDL)
        XCTAssertNil(prepared.hba1c, "HbA1c must be in %")
        XCTAssertNotNil(prepared.provenance["lipids"]?.reason)
    }
}

final class HealthBriefTests: XCTestCase {
    let now = HealyxDate.timestamp("2026-11-09T12:00:00Z")!

    func testLatestStatusAndChange() {
        let labs = [
            Biomarker(id: "1", name: "LDL", value: 132, unit: "mg/dL", testDate: "2026-10-01", status: "high"),
            Biomarker(id: "2", name: "LDL", value: 120, unit: "mg/dL", testDate: "2026-04-01", status: "normal"),
            Biomarker(id: "3", name: "Vitamin D", value: 31, unit: "ng/mL", testDate: "2026-10-01"),
            Biomarker(id: "4", name: "TSH", value: 2.1, unit: "mIU/L", testDate: nil, status: "normal"),
        ]
        let brief = HealthBriefBuilder.build(labs, now: now)
        XCTAssertEqual(brief.latest.count, 3)
        let ldl = brief.latest.first { $0.record.name == "LDL" }!
        XCTAssertEqual(ldl.classification, .flagged)
        XCTAssertEqual(ldl.change, "Up 12 mg/dL since 2026-04-01")
        XCTAssertEqual(ldl.dateLabel, "2026-10-01")
        XCTAssertEqual(brief.latest.first { $0.record.name == "Vitamin D" }?.classification, .unknown)
        let tsh = brief.latest.first { $0.record.name == "TSH" }!
        XCTAssertEqual(tsh.classification, .unknown, "an undated result's status is not trusted")
        XCTAssertEqual(tsh.dateLabel, "Date needs verification")
        XCTAssertEqual(brief.flagged, 1)
        XCTAssertEqual(brief.unknown, 2)
        XCTAssertEqual(brief.lastRecorded, "2026-10-01")
        XCTAssertEqual(brief.undatedCount, 1)
    }

    func testSameDayConflictIsUnknown() {
        let labs = [
            Biomarker(id: "1", name: "Ferritin", value: 40, unit: "ng/mL", testDate: "2026-10-01", status: "normal"),
            Biomarker(id: "2", name: "Ferritin", value: 44, unit: "ng/mL", testDate: "2026-10-01", status: "normal"),
        ]
        let row = HealthBriefBuilder.build(labs, now: now).latest[0]
        XCTAssertEqual(row.classification, .unknown)
        XCTAssertEqual(row.dateLabel, "2026-10-01 · conflicting entries")
        XCTAssertNil(row.change)
    }

    func testFourSignificantDigits() {
        XCTAssertEqual(HealthBriefBuilder.fourSignificant(12.3456), "12.35")
        XCTAssertEqual(HealthBriefBuilder.fourSignificant(0.10000000000000009), "0.1")
        XCTAssertEqual(HealthBriefBuilder.fourSignificant(12345), "12350")
    }
}

final class DateTests: XCTestCase {
    func testObservationDay() {
        let now = HealyxDate.timestamp("2026-11-09T12:00:00Z")!
        XCTAssertEqual(HealyxDate.observationDay("2026-11-09", now: now), "2026-11-09")
        XCTAssertEqual(HealyxDate.observationDay("2026-06-19T22:45:12.123456+00:00", now: now), "2026-06-19")
        XCTAssertNil(HealyxDate.observationDay("2026-11-10", now: now))
        XCTAssertNil(HealyxDate.observationDay("2026-02-30", now: now))
        XCTAssertNil(HealyxDate.observationDay("06/19/2026", now: now))
        XCTAssertNil(HealyxDate.observationDay(nil, now: now))
    }

    func testTimestampZones() {
        let a = HealyxDate.timestamp("2026-06-19T22:45:00+00:00")!
        let b = HealyxDate.timestamp("2026-06-19T18:45:00-04:00")!
        let c = HealyxDate.timestamp("2026-06-19T22:45:00Z")!
        XCTAssertEqual(a, b)
        XCTAssertEqual(a, c)
    }

    func testLocalValues() {
        let ny = TimeZone(identifier: "America/New_York")!
        let date = HealyxDate.timestamp("2026-11-09T06:30:00Z")!
        XCTAssertEqual(HealyxDate.localDateTimeString(date, timeZone: ny), "2026-11-09T01:30")
        XCTAssertEqual(HealyxDate.jsTimezoneOffsetMinutes(date, timeZone: ny), 300)
        XCTAssertTrue(HealyxDate.isLocalDateTime("2026-11-12T14:30"))
        XCTAssertFalse(HealyxDate.isLocalDateTime("2026-11-12T24:30"))
        XCTAssertEqual(HealyxDate.displayLocalDateTime("2026-11-12T14:30"), "Thu, Nov 12 at 2:30 PM")
        XCTAssertEqual(HealyxDate.displayDay("2026-05-01"), "May 1, 2026")
        XCTAssertEqual(HealyxDate.displayClock("08:05"), "8:05 AM")
        XCTAssertEqual(HealyxDate.displayClock("00:00"), "12:00 AM")
    }
}

final class DecodingTests: XCTestCase {
    func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try HealyxJSON.decoder.decode(T.self, from: Data(json.utf8))
    }

    func testVitalAcceptsNumericStrings() throws {
        let v = try decode(Vital.self, #"{"id":"v1","recorded_at":"2026-10-01T09:00:00+00:00","systolic_bp":"128","diastolic_bp":82,"weight_kg":null,"extra":true}"#)
        XCTAssertEqual(v.systolicBP, 128)
        XCTAssertEqual(v.diastolicBP, 82)
        XCTAssertNil(v.weightKg)
    }

    func testTemperatureFromLegacyWebEntries() throws {
        let legacy = try decode(Vital.self, #"{"id":"t1","temperature_celsius":98.6}"#)
        XCTAssertEqual(legacy.temperatureFahrenheit, 98.6)
        let celsius = try decode(Vital.self, #"{"id":"t2","temperature_celsius":37}"#)
        XCTAssertEqual(celsius.temperatureFahrenheit!, 98.6, accuracy: 0.001)
    }

    func testBiomarkerValueText() throws {
        let b = try decode([Biomarker].self, #"[{"id":"b1","name":"LDL","value":132,"unit":"mg/dL","test_date":"2026-10-01"},{"id":7,"name":"CRP","value":"<0.5","unit":"mg/L"}]"#)
        XCTAssertEqual(b[0].valueText, "132")
        XCTAssertEqual(b[0].value, 132)
        XCTAssertEqual(b[1].id, "7")
        XCTAssertNil(b[1].value)
        XCTAssertEqual(b[1].valueText, "<0.5")
    }

    func testAgentTaskToleratesUnknownValues() throws {
        let t = try decode(AgentTask.self, #"{"id":"t1","agent":"medications","kind":"med_reminder","title":"Take metformin 500 mg","status":"todo","due_at":null,"payload":{"times":["08:00","20:00"],"days":[]},"created_at":"2026-11-09T06:00:00+00:00"}"#)
        XCTAssertEqual(t.kind, .medReminder)
        XCTAssertEqual(t.agent, .medications)
        XCTAssertEqual(t.summaryLine, "8:00 AM, 8:00 PM · suggested")
        let odd = try decode(AgentTask.self, #"{"id":"t2","kind":"something_new","status":"weird","title":"X"}"#)
        XCTAssertEqual(odd.kind, .unknown)
        XCTAssertEqual(odd.status, .todo)
    }

    func testAgentRunResultSkipsBadTasks() throws {
        let r = try decode(AgentRunResult.self, #"{"reply":"Done.","persisted":true,"tasks":[{"id":"a","kind":"shopping_list","title":"Kit","status":"todo","payload":{"items":[{"name":"Thermometer"}]}},{"title":"no id"}]}"#)
        XCTAssertEqual(r.reply, "Done.")
        XCTAssertEqual(r.tasks.count, 1)
        XCTAssertEqual(r.tasks[0].summaryLine, "1 items")
    }

    func testInputsEncodeExplicitNulls() throws {
        let data = try HealyxJSON.encoder.encode(ConditionInput(name: "Hypertension", notes: "  "))
        let text = String(data: data, encoding: .utf8)!
        XCTAssertTrue(text.contains(#""notes":null"#), text)
        XCTAssertFalse(text.contains("user_id"), "updates must not send user_id")
        let insert = try HealyxJSON.encoder.encode(MedicationInput(userID: "u1", name: "Metformin", dosage: "500 mg"))
        XCTAssertTrue(String(data: insert, encoding: .utf8)!.contains(#""user_id":"u1""#))
    }

    func testVitalInputConvertsUnits() throws {
        let date = HealyxDate.timestamp("2026-11-09T06:30:00Z")!
        let weight = VitalKind.weight.input(userID: "u", recordedAt: date, value: 180)
        XCTAssertEqual(weight.weightKg, 81.6)
        let temp = VitalKind.temperature.input(userID: "u", recordedAt: date, value: 98.6)
        XCTAssertEqual(temp.temperatureCelsius, 37)
        let text = String(data: try HealyxJSON.encoder.encode(temp), encoding: .utf8)!
        XCTAssertTrue(text.contains(#""recorded_at":"2026-11-09T06:30:00Z""#), text)
        XCTAssertFalse(text.contains("weight_kg"), "only the measured field is sent")
    }
}

actor StepLog {
    var steps: [AgentStep] = []
    func add(_ step: AgentStep) { steps.append(step) }
}

final class APITests: XCTestCase {
    func testAgentBodyMatchesRouteSchema() throws {
        let ny = TimeZone(identifier: "America/New_York")!
        let now = HealyxDate.timestamp("2026-11-09T06:30:00Z")!
        let history = (0..<15).map { ChatTurn(role: $0 % 2 == 0 ? .user : .assistant, content: "turn \($0)") }
        let body = HealyxAPI.agentBody(agent: .appointments, message: "Book my physical", history: history, now: now, timeZone: ny)
        XCTAssertEqual(body["now"], .string("2026-11-09T01:30"))
        XCTAssertEqual(body["tz"], .string("America/New_York"))
        XCTAssertEqual(body["history"]?.array.count, 12)

        let api = HealyxAPI(baseURL: URL(string: "https://healyx-health.vercel.app")!) { "token-123" }
        let request = try api.makeRequest(path: "api/agents/run", body: body, accessToken: "token-123")
        XCTAssertEqual(request.url?.absoluteString, "https://healyx-health.vercel.app/api/agents/run")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer token-123")
        let json = String(data: request.httpBody!, encoding: .utf8)!
        XCTAssertTrue(json.contains(#""tzOffsetMinutes":300"#), "the route requires an integer: \(json)")
    }

    func testServerErrorsCarryTheirMessage() {
        let data = Data(#"{"error":"Too many requests right now. Please wait a moment and try again."}"#.utf8)
        XCTAssertThrowsError(try HealyxAPI.decode(AgentRunResult.self, data: data, status: 429)) { error in
            XCTAssertEqual(error.localizedDescription, "Too many requests right now. Please wait a moment and try again.")
        }
        XCTAssertThrowsError(try HealyxAPI.decode(AgentRunResult.self, data: Data("<html>".utf8), status: 401)) { error in
            XCTAssertEqual(error as? HealyxAPIError, .notSignedIn)
        }
    }

    func testStreamedAgentRun() async throws {
        let body = """
        {"type":"step","step":{"id":"call_1","label":"Searching the web: annual physical Tampa","status":"running"}}
        {"type":"step","step":{"id":"call_1","label":"Searching the web: annual physical Tampa","status":"done"}}

        {"type":"done","reply":"I drafted a request.","tasks":[{"id":"t9","agent":"appointments","kind":"appointment","title":"Annual physical","status":"todo","payload":{"starts_at":"2026-11-12T14:30"}}],"updates":[{"id":"t1","status":"done"},{"id":"t2","status":"bogus"}],"persisted":true,"meta":{"duration_ms":12400,"steps":[{"label":"Searching the web","status":"done"}],"sources":[{"title":"Clinic","url":"https://example.org"}],"provider":"groq"}}
        """
        let seen = StepLog()
        let result = try await HealyxAPI.agentResult(data: Data(body.utf8), status: 200, contentType: "application/x-ndjson; charset=utf-8") { step in
            await seen.add(step)
        }
        let steps = await seen.steps
        XCTAssertEqual(steps.map(\.status), [.running, .done])
        XCTAssertEqual(result.reply, "I drafted a request.")
        XCTAssertEqual(result.tasks.first?.summaryLine, "Thu, Nov 12 at 2:30 PM")
        XCTAssertEqual(result.updates, [TaskStatusUpdate(id: "t1", status: .done)])
        XCTAssertEqual(result.meta?.durationText, "12 s")
        XCTAssertEqual(result.meta?.sources.first?.url.absoluteString, "https://example.org")
    }

    func testStreamErrorsAndCrisisReplies() async throws {
        let failing = #"{"type":"step","step":{"id":"a","label":"Reading the FDA label","status":"running"}}"# + "\n" + #"{"type":"error","error":"The agent hit its time limit."}"#
        do {
            _ = try await HealyxAPI.agentResult(data: Data(failing.utf8), status: 200, contentType: "application/x-ndjson")
            XCTFail("expected an error")
        } catch {
            XCTAssertEqual(error.localizedDescription, "The agent hit its time limit.")
        }
        let truncated = #"{"type":"step","step":{"id":"a","label":"x","status":"running"}}"#
        do {
            _ = try await HealyxAPI.agentResult(data: Data(truncated.utf8), status: 200, contentType: "application/x-ndjson")
            XCTFail("expected an error")
        } catch {
            XCTAssertEqual(error.localizedDescription, "The agent stopped before finishing. Please try again.")
        }
        // A crisis reply is plain JSON with no tasks.
        let crisis = #"{"reply":"If you are thinking about harming yourself, call or text 988.","urgent":"crisis","tasks":[],"persisted":false}"#
        let result = try await HealyxAPI.agentResult(data: Data(crisis.utf8), status: 200, contentType: "application/json")
        XCTAssertEqual(result.urgent, "crisis")
        XCTAssertTrue(result.tasks.isEmpty)
    }

    func testMessageMetaFromSavedRow() throws {
        let row = #"{"id":"m1","agent":"research","role":"assistant","content":"Here is what holds up.","created_at":"2026-11-09T06:00:00+00:00","meta":{"duration_ms":65000,"steps":[{"label":"Searching PubMed: magnesium sleep","status":"done"},{"label":"Saving a research brief","status":"error"}],"sources":[{"title":"No URL"}]}}"#
        let message = try HealyxJSON.decoder.decode(AgentMessage.self, from: Data(row.utf8))
        XCTAssertEqual(message.meta?.steps.count, 2)
        XCTAssertEqual(message.meta?.steps.last?.status, .error)
        XCTAssertEqual(message.meta?.durationText, "1 min 5 s")
        XCTAssertEqual(message.meta?.sources.count, 0, "sources without a URL are dropped")
        let plain = try HealyxJSON.decoder.decode(AgentMessage.self, from: Data(#"{"id":"m2","role":"user","content":"hi"}"#.utf8))
        XCTAssertNil(plain.meta)
    }

    func testStoreLinksEncodeQueries() {
        XCTAssertEqual(StoreSearch.cvs.url(for: "blood pressure monitor")?.absoluteString,
                       "https://www.cvs.com/search?searchTerm=blood%20pressure%20monitor")
        XCTAssertEqual(Weekday.parse(["MO", "WE", "XX"]), [.MO, .WE])
        XCTAssertEqual(Weekday.parse(Weekday.allCases.map(\.rawValue)), [])
    }
}

// MARK: - Wellness scores

final class WellnessTests: XCTestCase {
    let cal: Calendar = { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "America/New_York")!; return c }()
    func date(_ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
        cal.date(from: DateComponents(year: 2026, month: 11, day: day, hour: hour, minute: minute))!
    }

    func testSleepUnionAndStages() {
        let sleep = [
            SleepSegment(start: date(18, 23), end: date(19, 7), stage: .unspecified), // iPhone, 8h
            SleepSegment(start: date(18, 23), end: date(19, 1), stage: .core),
            SleepSegment(start: date(19, 1), end: date(19, 2), stage: .deep),
            SleepSegment(start: date(19, 2), end: date(19, 4), stage: .rem),
            SleepSegment(start: date(19, 4), end: date(19, 7), stage: .core),
        ]
        let result = WellnessScoring.compute(WellnessInput(now: date(19, 21), calendar: cal, sleep: sleep)).sleep!
        XCTAssertEqual(result.asleepMinutes, 480)
        XCTAssertEqual(result.deepMinutes, 60)
        XCTAssertEqual(result.remMinutes, 120)
        XCTAssertEqual(result.score, 99) // 0.7*100 + 0.3*((0.961+1)/2*100)
    }

    func testRecoveryNeedsBaseline() {
        let hrv = [TimedValue(date: date(19, 6), value: 60)]
        XCTAssertNil(WellnessScoring.compute(WellnessInput(now: date(19, 21), calendar: cal, hrv: hrv)).recovery)
        let history = (10...18).map { TimedValue(date: date($0, 6), value: 50) }
        let result = WellnessScoring.compute(WellnessInput(now: date(19, 21), calendar: cal, hrv: history + hrv)).recovery!
        XCTAssertEqual(result.hrvBaseline, 50)
        XCTAssertEqual(result.score, 80) // 50 + 0.2*150
    }

    func testStressExcludesWorkouts() {
        let rhr = (10...18).map { TimedValue(date: date($0, 8), value: 60) }
        var hr = (0..<20).map { TimedValue(date: date(19, 10, $0), value: 72) }
        hr += (0..<20).map { TimedValue(date: date(19, 17, $0), value: 160) }
        let workout = TimeInterval2(start: date(19, 17), end: date(19, 18))
        let result = WellnessScoring.compute(WellnessInput(now: date(19, 21), calendar: cal, restingHR: rhr,
                                                           heartRate: hr, workouts: [workout])).stress!
        XCTAssertEqual(result.averageHR, 72)
        XCTAssertEqual(result.score, 50) // 20% above resting / 40%
        XCTAssertEqual(result.level, "Moderate")
    }

    func testNutritionBalance() {
        let totals = NutritionTotals(energyKcal: 2000, proteinG: 100, carbsG: 250, fatG: 66.7, fiberG: 28)
        let result = WellnessScoring.compute(WellnessInput(now: date(19, 21), calendar: cal, nutrition: totals)).nutrition!
        XCTAssertEqual(result.proteinPct, 20)
        XCTAssertEqual(result.score, 100)
        XCTAssertNil(WellnessScoring.compute(WellnessInput(now: date(19, 21), calendar: cal)).nutrition)
    }
}

// MARK: - Biological age and summary

final class BiologicalAgeTests: XCTestCase {
    // Worked example from a published PhenoAge walkthrough (US units), computed with
    // the corrected 0.090165 constant: about 53.2 years at a calendar age of 64.12.
    func testPhenoAgeWorkedExample() {
        let age = BiologicalAge.phenoAge(albuminGL: 41, creatinineUmolL: 0.73 * 88.42, glucoseMmolL: 94 / 18.016,
                                         crpMgDL: 0.019, lymphocytePct: 27.78, mcvFL: 88, rdwPct: 13.6,
                                         alpUL: 48, wbcK: 3.9, age: 64.12)
        XCTAssertEqual(age ?? 0, 53.21, accuracy: 0.05)
    }

    func testEvaluateFromLabsInUSUnits() {
        let labs = [
            Biomarker(id: "1", name: "Albumin", value: 4.1, unit: "g/dL", testDate: "2026-05-23"),
            Biomarker(id: "2", name: "Creatinine", value: 0.73, unit: "mg/dL", testDate: "2026-05-23"),
            Biomarker(id: "3", name: "Glucose", value: 94, unit: "mg/dL", testDate: "2026-05-23"),
            Biomarker(id: "4", name: "hs-CRP", value: 0.19, unit: "mg/L", testDate: "2026-05-23"),
            Biomarker(id: "5", name: "Lymphocytes", value: 27.78, unit: "%", testDate: "2026-05-23"),
            Biomarker(id: "6", name: "Lymphocytes (Absolute)", value: 1.1, unit: "x10E3/uL", testDate: "2026-05-23"),
            Biomarker(id: "7", name: "MCV", value: 88, unit: "fL", testDate: "2026-05-23"),
            Biomarker(id: "8", name: "RDW", value: 13.6, unit: "%", testDate: "2026-05-23"),
            Biomarker(id: "9", name: "Alkaline Phosphatase", value: 48, unit: "IU/L", testDate: "2026-05-23"),
            Biomarker(id: "10", name: "WBC", value: 3.9, unit: "x10E3/uL", testDate: "2026-05-23"),
        ]
        let result = BiologicalAge.evaluate(biomarkers: labs, dateOfBirth: "1962-04-10")
        XCTAssertTrue(result.missing.isEmpty)
        XCTAssertEqual(result.chronologicalAge ?? 0, 64.12, accuracy: 0.02)
        XCTAssertEqual(result.age ?? 0, 53.2, accuracy: 0.1)

        let partial = BiologicalAge.evaluate(biomarkers: Array(labs.prefix(3)), dateOfBirth: nil)
        XCTAssertNil(partial.age)
        XCTAssertTrue(partial.needsDateOfBirth)
        XCTAssertEqual(partial.missing.count, 6)
    }

    func testSummarySentence() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York")!
        let evening = cal.date(from: DateComponents(year: 2026, month: 11, day: 19, hour: 21))!
        let sleep = SleepResult(score: 80, asleepMinutes: 432, needMinutes: 480, deepMinutes: nil, remMinutes: nil,
                                coreMinutes: nil, wokeAt: nil)
        let recovery = RecoveryResult(score: 70, hrvToday: 60, hrvBaseline: 50, restingToday: 58, restingBaseline: 60)
        let snapshot = WellnessSnapshot(sleep: sleep, recovery: recovery, stress: nil, nutrition: nil, computedAt: evening)
        XCTAssertEqual(WellnessSummary.sentence(snapshot: snapshot, firstName: "Kenny", now: evening, calendar: cal),
                       "Good evening, Kenny. You slept 7h 12m, short of your 8h goal. HRV is above your usual, so recovery looks solid.")
    }

    func testSyncRoundTripKeepsChartData() throws {
        let start = Date(timeIntervalSince1970: 1_795_000_000)
        var snapshot = WellnessSnapshot(sleep: nil, recovery: nil, stress: StressResult(score: 40, averageHR: 70, restingReference: 60),
                                        nutrition: nil, computedAt: start)
        snapshot.sleepSegments = [SleepSegment(start: start, end: start.addingTimeInterval(3600), stage: .deep)]
        snapshot.stressHourly = [TimedValue(date: start, value: 42)]
        let row = WellnessDailyRow(snapshot: snapshot, userID: nil)
        let data = try HealyxJSON.encoder.encode(row)
        let decoded = try HealyxJSON.decoder.decode(WellnessDailyRow.self, from: data).snapshot
        XCTAssertEqual(decoded.sleepSegments.first?.stage, .deep)
        XCTAssertEqual(decoded.stressHourly.first?.value, 42)
    }
}
