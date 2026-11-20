import Foundation

// Port of the web app's lib/healthBrief.ts: the latest result per lab marker,
// its recorded status, and a change since the previous comparable result.
// Unknown stays unknown: a missing flag never becomes "normal".

public enum HealthClassification: String, Sendable {
    case inRange = "in-range"
    case flagged
    case unknown
}

public struct BriefRecord: Identifiable, Hashable, Sendable {
    public let record: Biomarker
    public let classification: HealthClassification
    public let change: String?
    public let dateLabel: String
    public let dateVerified: Bool
    public var id: String { record.id }
}

public struct HealthBrief: Sendable {
    public let latest: [BriefRecord]
    public let inRange: Int
    public let flagged: Int
    public let unknown: Int
    public let lastRecorded: String?
    public let undatedCount: Int

    public static let empty = HealthBrief(latest: [], inRange: 0, flagged: 0, unknown: 0, lastRecorded: nil, undatedCount: 0)
}

public enum HealthBriefBuilder {
    static func key(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
            .split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
            .lowercased()
    }

    public static func classification(_ status: String?) -> HealthClassification {
        guard let status else { return .unknown }
        let normalized = key(status).replacingOccurrences(of: "_", with: "-").replacingOccurrences(of: " ", with: "-")
        if ["normal", "optimal", "in-range", "within-range"].contains(normalized) { return .inRange }
        if ["high", "low", "borderline", "critical", "out-of-range", "abnormal"].contains(normalized) { return .flagged }
        return .unknown
    }

    /// Day timestamp for a valid, not-future test date (web `dated`).
    static func dated(_ value: String?, now: Date) -> Double? {
        guard let value, value.count >= 10 else { return nil }
        let head = String(value.prefix(10))
        guard value.count == 10 || value.dropFirst(10).first == "T" else { return nil }
        if value.contains("T"), HealyxDate.timestamp(value) == nil { return nil }
        guard let day = HealyxDate.utcDay(head), head <= HealyxDate.utcDayString(now) else { return nil }
        return day.timeIntervalSince1970
    }

    static func numeric(_ b: Biomarker) -> Double? {
        if let text = b.valueText?.trimmingCharacters(in: .whitespaces),
           text.range(of: #"^[+-]?(?:\d+\.?\d*|\.\d+)$"#, options: .regularExpression) != nil {
            return Double(text)
        }
        return nil
    }

    /// JavaScript `Number(x.toPrecision(4))` rendered as text.
    static func fourSignificant(_ x: Double) -> String {
        guard x != 0, x.isFinite else { return "0" }
        // JavaScript breaks exact ties toward the larger digit (12345 -> 12350), unlike printf.
        let exponent = Int(floor(log10(abs(x)))) - 3
        let power = pow(10, Double(abs(exponent)))
        let scaled = exponent >= 0 ? x / power : x * power
        let digits = scaled.rounded(.toNearestOrAwayFromZero)
        let value = exponent >= 0 ? digits * power : digits / power
        return jsNumberString(value)
    }

    static func valueKey(_ b: Biomarker) -> String { b.valueText ?? "null" }

    public static func build(_ records: [Biomarker], now: Date = Date()) -> HealthBrief {
        var order: [String] = []
        var groups: [String: [(Int, Biomarker)]] = [:]
        for (index, row) in records.enumerated() {
            let name = key(row.name)
            guard !name.isEmpty else { continue }
            if groups[name] == nil { order.append(name) }
            groups[name, default: []].append((index, row))
        }

        var lastRecorded: String?
        var latest: [BriefRecord] = []
        for name in order {
            let rows = groups[name] ?? []
            let sorted = rows.sorted { a, b in
                let da = dated(a.1.testDate, now: now) ?? -.infinity
                let db = dated(b.1.testDate, now: now) ?? -.infinity
                return da != db ? da > db : a.0 < b.0
            }.map(\.1)
            guard let row = sorted.first else { continue }
            let date = dated(row.testDate, now: now)
            let day = date == nil ? nil : row.testDate.map { String($0.prefix(10)) }
            if let day, lastRecorded == nil || day > lastRecorded! { lastRecorded = day }

            let sameDay = date == nil ? [] : sorted.filter { dated($0.testDate, now: now) == date }
            let conflict = sameDay.contains {
                valueKey($0) != valueKey(row) || $0.unit != row.unit || classification($0.status) != classification(row.status)
            }

            var change: String?
            let unit = row.unit?.trimmingCharacters(in: .whitespaces) ?? ""
            if let date, !conflict, !unit.isEmpty,
               let previous = sorted.first(where: { (dated($0.testDate, now: now) ?? .infinity) < date }),
               previous.unit?.trimmingCharacters(in: .whitespaces) == unit {
                let prevDate = dated(previous.testDate, now: now)
                let priorConflict = sorted.contains {
                    dated($0.testDate, now: now) == prevDate && (valueKey($0) != valueKey(previous) || $0.unit != previous.unit)
                }
                if !priorConflict, let current = numeric(row), let prior = numeric(previous) {
                    let delta = current - prior
                    let since = previous.testDate.map { String($0.prefix(10)) } ?? ""
                    let movement = delta == 0 ? "Unchanged" : "\(delta > 0 ? "Up" : "Down") \(fourSignificant(abs(delta))) \(unit)"
                    change = "\(movement) since \(since)"
                }
            }

            latest.append(BriefRecord(
                record: row,
                classification: date == nil || conflict ? .unknown : classification(row.status),
                change: change,
                dateLabel: conflict ? "\(day ?? "") · conflicting entries" : (day ?? "Date needs verification"),
                dateVerified: date != nil
            ))
        }

        return HealthBrief(
            latest: latest,
            inRange: latest.filter { $0.classification == .inRange }.count,
            flagged: latest.filter { $0.classification == .flagged }.count,
            unknown: latest.filter { $0.classification == .unknown }.count,
            lastRecorded: lastRecorded,
            undatedCount: records.filter { dated($0.testDate, now: now) == nil }.count
        )
    }
}
