import Foundation

/// Date helpers that mirror the web app's rules exactly.
/// Postgres `date` columns arrive as "YYYY-MM-DD"; `timestamptz` columns as
/// "YYYY-MM-DDTHH:MM:SS(.ffffff)+00:00". Local wall-clock values used by agents
/// are "YYYY-MM-DD" and "YYYY-MM-DDTHH:MM" with no zone.
public enum HealyxDate {
    private static let utc = TimeZone(identifier: "UTC")!

    private static var utcCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        return calendar
    }

    private static let dayPattern = try! NSRegularExpression(pattern: #"^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$"#)
    private static let localDateTimePattern = try! NSRegularExpression(pattern: #"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$"#)
    private static let timestampPattern = try! NSRegularExpression(
        pattern: #"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}(?::?\d{2})?)?$"#
    )

    private static func groups(_ regex: NSRegularExpression, _ value: String) -> [String?]? {
        let range = NSRange(value.startIndex..., in: value)
        guard let match = regex.firstMatch(in: value, range: range) else { return nil }
        return (0..<match.numberOfRanges).map { index in
            let r = match.range(at: index)
            guard r.location != NSNotFound, let swiftRange = Range(r, in: value) else { return nil }
            return String(value[swiftRange])
        }
    }

    /// A real calendar day ("2026-02-30" is not), as a UTC midnight Date.
    public static func utcDay(_ day: String) -> Date? {
        guard let g = groups(dayPattern, day), day.count == 10,
              let y = Int(g[1] ?? ""), let m = Int(g[2] ?? ""), let d = Int(g[3] ?? "") else { return nil }
        let comps = DateComponents(year: y, month: m, day: d)
        guard let date = utcCalendar.date(from: comps) else { return nil }
        let back = utcCalendar.dateComponents([.year, .month, .day], from: date)
        guard back.year == y, back.month == m, back.day == d else { return nil }
        return date
    }

    /// "YYYY-MM-DD" for a Date in UTC (JavaScript `toISOString().slice(0, 10)`).
    public static func utcDayString(_ date: Date) -> String {
        let c = utcCalendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Parses an ISO-8601 timestamp. Fractional seconds of any length are accepted.
    /// A timestamp with no zone is read as local time, as JavaScript's Date.parse does.
    public static func timestamp(_ value: String) -> Date? {
        guard let g = groups(timestampPattern, value),
              let y = Int(g[1] ?? ""), let mo = Int(g[2] ?? ""), let d = Int(g[3] ?? ""),
              let h = Int(g[4] ?? ""), let mi = Int(g[5] ?? "") else { return nil }
        let s = Int(g[6] ?? "0") ?? 0
        guard h < 24, mi < 60, s < 61, utcDay(String(value.prefix(10))) != nil else { return nil }
        var fraction = 0.0
        if let digits = g[7] { fraction = Double("0." + digits) ?? 0 }

        var calendar = Calendar(identifier: .gregorian)
        if let zone = g[8] {
            if zone == "Z" {
                calendar.timeZone = utc
            } else {
                let sign = zone.hasPrefix("-") ? -1 : 1
                let digits = zone.dropFirst().replacingOccurrences(of: ":", with: "")
                let hours = Int(digits.prefix(2)) ?? 0
                let minutes = digits.count >= 4 ? Int(digits.dropFirst(2).prefix(2)) ?? 0 : 0
                guard let tz = TimeZone(secondsFromGMT: sign * (hours * 3600 + minutes * 60)) else { return nil }
                calendar.timeZone = tz
            }
        } else {
            calendar.timeZone = .current
        }
        let comps = DateComponents(year: y, month: mo, day: d, hour: h, minute: mi, second: s)
        guard let date = calendar.date(from: comps) else { return nil }
        return date.addingTimeInterval(fraction)
    }

    /// Port of the web `observationDate`: the observation's day ("YYYY-MM-DD") when the
    /// value is a valid date or timestamp that is not in the future; otherwise nil.
    public static func observationDay(_ value: String?, now: Date = Date()) -> String? {
        guard let value, groups(dayPattern, value) != nil else { return nil }
        if value.contains("T") {
            guard let parsed = timestamp(value), parsed <= now else { return nil }
        }
        let day = String(value.prefix(10))
        guard utcDay(day) != nil, day <= utcDayString(now) else { return nil }
        return day
    }

    // MARK: Local wall-clock values (agents)

    /// "YYYY-MM-DDTHH:MM" in the given time zone (what the web's `localNow()` sends).
    public static func localDateTimeString(_ date: Date, timeZone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let c = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        return String(format: "%04d-%02d-%02dT%02d:%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0, c.hour ?? 0, c.minute ?? 0)
    }

    /// "YYYY-MM-DD" in the given time zone.
    public static func localDateString(_ date: Date, timeZone: TimeZone = .current) -> String {
        String(localDateTimeString(date, timeZone: timeZone).prefix(10))
    }

    /// Minutes, positive west of UTC: the value of JavaScript's `Date#getTimezoneOffset()`.
    public static func jsTimezoneOffsetMinutes(_ date: Date, timeZone: TimeZone = .current) -> Int {
        -timeZone.secondsFromGMT(for: date) / 60
    }

    public static func isLocalDate(_ value: String?) -> Bool {
        guard let value, value.count == 10 else { return false }
        return utcDay(value) != nil
    }

    public static func isLocalDateTime(_ value: String?) -> Bool {
        guard let value, let g = groups(localDateTimePattern, value),
              let h = Int(g[4] ?? ""), let m = Int(g[5] ?? "") else { return false }
        return isLocalDate(String(value.prefix(10))) && h < 24 && m < 60
    }

    /// Calendar components for a local "YYYY-MM-DDTHH:MM" value.
    public static func components(localDateTime value: String) -> DateComponents? {
        guard isLocalDateTime(value), let g = groups(localDateTimePattern, value) else { return nil }
        return DateComponents(year: Int(g[1] ?? ""), month: Int(g[2] ?? ""), day: Int(g[3] ?? ""),
                              hour: Int(g[4] ?? ""), minute: Int(g[5] ?? ""))
    }

    /// The Date for a local wall-clock value in the given time zone.
    public static func date(localDateTime value: String, timeZone: TimeZone = .current) -> Date? {
        guard let comps = components(localDateTime: value) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar.date(from: comps)
    }

    /// Local midnight for a "YYYY-MM-DD" day, for date pickers (avoids the one-day
    /// shift you get from treating a date-only value as UTC).
    public static func date(localDay value: String?, timeZone: TimeZone = .current) -> Date? {
        guard let value, isLocalDate(String(value.prefix(10))) else { return nil }
        return date(localDateTime: String(value.prefix(10)) + "T00:00", timeZone: timeZone)
    }

    /// ISO-8601 UTC timestamp for a Date (what the web stores in `due_at`).
    public static func isoTimestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }

    // MARK: Display

    /// "May 1, 2026" for a "YYYY-MM-DD" day (no time zone shift).
    public static func displayDay(_ day: String?) -> String? {
        guard let day, let date = utcDay(String(day.prefix(10))) else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = utc
        formatter.dateFormat = "MMM d, yyyy"
        return formatter.string(from: date)
    }

    /// "Thu, Nov 12 at 2:30 PM" for a local "YYYY-MM-DDTHH:MM" value.
    public static func displayLocalDateTime(_ value: String?) -> String? {
        guard let value, let date = date(localDateTime: value, timeZone: utc) else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = utc
        formatter.dateFormat = "EEE, MMM d 'at' h:mm a"
        return formatter.string(from: date)
    }

    /// "8:00 AM" for "08:00".
    public static func displayClock(_ value: String) -> String {
        let parts = value.split(separator: ":")
        guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]), h < 24, m < 60 else { return value }
        let suffix = h < 12 ? "AM" : "PM"
        let hour = h % 12 == 0 ? 12 : h % 12
        return "\(hour):\(String(format: "%02d", m)) \(suffix)"
    }
}
