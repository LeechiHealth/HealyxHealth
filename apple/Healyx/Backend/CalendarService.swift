import Foundation
import EventKit
import HealyxKit

/// A calendar event to create from an agent task.
struct CalendarItem {
    enum Repeat { case daily, weekly([Weekday]) }

    var title: String
    var start: Date
    var durationMinutes: Int
    var notes: String?
    var location: String?
    var alarmsMinutesBefore: [Int]
    var repeats: Repeat?
}

/// Adds agent reminders straight to the person's calendar (the web app offers an
/// .ics download instead). Uses write-only access: Healyx can add events but can
/// never read the calendar.
@MainActor
final class CalendarService {
    static let shared = CalendarService()
    private let store = EKEventStore()

    enum CalendarError: LocalizedError {
        case denied, noCalendar, nothingToAdd

        var errorDescription: String? {
            switch self {
            case .denied: return "Healyx needs permission to add events. Turn it on in Settings, under Privacy & Security, Calendars."
            case .noCalendar: return "No calendar is available to add events to."
            case .nothingToAdd: return "Set a date and time first."
            }
        }
    }

    /// Adds the events and returns how many were created.
    func add(_ items: [CalendarItem]) async throws -> Int {
        guard !items.isEmpty else { throw CalendarError.nothingToAdd }
        let granted = try await store.requestWriteOnlyAccessToEvents()
        guard granted else { throw CalendarError.denied }
        guard let calendar = store.defaultCalendarForNewEvents else { throw CalendarError.noCalendar }

        for item in items {
            let event = EKEvent(eventStore: store)
            event.calendar = calendar
            event.title = item.title
            event.startDate = item.start
            event.endDate = item.start.addingTimeInterval(TimeInterval(max(item.durationMinutes, 5) * 60))
            event.notes = item.notes
            event.location = item.location
            for minutes in item.alarmsMinutesBefore {
                event.addAlarm(EKAlarm(relativeOffset: TimeInterval(-minutes * 60)))
            }
            switch item.repeats {
            case .daily?:
                event.addRecurrenceRule(EKRecurrenceRule(recurrenceWith: .daily, interval: 1, end: nil))
            case .weekly(let days)?:
                let weekdays = days.compactMap { EKWeekday(rawValue: $0.calendarWeekday) }.map { EKRecurrenceDayOfWeek($0) }
                event.addRecurrenceRule(EKRecurrenceRule(
                    recurrenceWith: .weekly, interval: 1, daysOfTheWeek: weekdays,
                    daysOfTheMonth: nil, monthsOfTheYear: nil, weeksOfTheYear: nil,
                    daysOfTheYear: nil, setPositions: nil, end: nil))
            case nil:
                break
            }
            try store.save(event, span: .futureEvents, commit: false)
        }
        try store.commit()
        return items.count
    }
}

/// Calendar events for each task kind, matching the web task card's .ics files.
enum TaskCalendar {
    static func items(for task: AgentTask, timeZone: TimeZone = .current) -> [CalendarItem] {
        let p = task.payload
        switch task.kind {
        case .appointment:
            guard let startsAt = p["starts_at"]?.string,
                  let start = HealyxDate.date(localDateTime: startsAt, timeZone: timeZone) else { return [] }
            var notes: [String] = []
            if let reason = p["reason"]?.string { notes.append(reason) }
            let questions = p["questions_to_ask"]?.stringArray ?? []
            if !questions.isEmpty { notes.append("Questions to ask:\n" + questions.map { "- \($0)" }.joined(separator: "\n")) }
            return [CalendarItem(
                title: p["title"]?.string ?? task.title, start: start,
                durationMinutes: p["duration_minutes"]?.int ?? 30,
                notes: notes.isEmpty ? nil : notes.joined(separator: "\n"),
                location: p["location"]?.string, alarmsMinutesBefore: [1440, 60], repeats: nil)]

        case .medReminder:
            let startDay = HealyxDate.isLocalDate(p["start_date"]?.string)
                ? p["start_date"]!.string!
                : HealyxDate.localDateString(Date(), timeZone: timeZone)
            let days = Weekday.parse(p["days"]?.stringArray ?? [])
            let notes = [p["instructions"]?.string, "Reminder from Healyx. Take as directed on your prescription label."]
                .compactMap { $0 }.joined(separator: "\n")
            let times = p["times"]?.stringArray ?? ["08:00"]
            return times.compactMap { time -> CalendarItem? in
                guard let start = HealyxDate.date(localDateTime: "\(startDay)T\(time)", timeZone: timeZone) else { return nil }
                return CalendarItem(title: task.title, start: start, durationMinutes: 5, notes: notes, location: nil,
                                    alarmsMinutesBefore: [0], repeats: days.isEmpty ? .daily : .weekly(days))
            }

        case .refillRequest:
            guard let remindOn = p["remind_on"]?.string,
                  let start = HealyxDate.date(localDateTime: "\(remindOn)T09:00", timeZone: timeZone) else { return [] }
            let medication = p["medication"]?.string ?? task.title
            let dose = p["dose"]?.string.map { " \($0)" } ?? ""
            let notes = [
                p["pharmacy"]?.string.map { "Pharmacy: \($0)" },
                p["prescriber"]?.string.map { "Prescriber: \($0)" },
                p["runs_out_on"]?.string.map { "Estimated last dose: \($0)" },
            ].compactMap { $0 }.joined(separator: "\n")
            return [CalendarItem(title: "Request refill: \(medication)\(dose)", start: start, durationMinutes: 15,
                                 notes: notes.isEmpty ? nil : notes, location: nil, alarmsMinutesBefore: [0], repeats: nil)]

        case .researchBrief, .shoppingList, .unknown:
            return []
        }
    }
}
