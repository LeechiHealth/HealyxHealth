import Foundation

/// JSON coders used for every Supabase row and Healyx API payload.
/// Dates stay as the strings Postgres returns ("2026-05-01" or a timestamp)
/// and are parsed by `HealyxDate`, so no date strategy is needed here.
public enum HealyxJSON {
    public static var decoder: JSONDecoder { JSONDecoder() }
    public static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }
}

/// Formats a number the way JavaScript's `String(number)` does for typical values:
/// 5 -> "5", 5.25 -> "5.25". Used so lab values read the same as on the web.
public func jsNumberString(_ value: Double) -> String {
    guard value.isFinite else { return "" }
    if value.rounded() == value, abs(value) < 1e15 {
        return String(Int64(value))
    }
    return "\(value)"
}

extension KeyedDecodingContainer {
    /// Decodes a number that may arrive as a JSON number or a numeric string.
    /// Anything else (null, missing, malformed) becomes nil instead of an error.
    func lossyDouble(_ key: Key) -> Double? {
        if let value = try? decodeIfPresent(Double.self, forKey: key) { return value.isFinite ? value : nil }
        if let text = try? decodeIfPresent(String.self, forKey: key) {
            return finiteObservation(text)
        }
        return nil
    }

    /// Decodes a string, accepting numbers too (rendered JavaScript-style).
    func lossyString(_ key: Key) -> String? {
        if let value = try? decodeIfPresent(String.self, forKey: key) { return value }
        if let number = try? decodeIfPresent(Double.self, forKey: key) { return jsNumberString(number) }
        if let flag = try? decodeIfPresent(Bool.self, forKey: key) { return flag ? "true" : "false" }
        return nil
    }

    /// Row ids are uuids in Healyx, but accept integers so a schema change can't break decoding.
    func rowID(_ key: Key) throws -> String {
        if let value = try? decode(String.self, forKey: key) { return value }
        if let value = try? decode(Int.self, forKey: key) { return String(value) }
        throw DecodingError.keyNotFound(key, .init(codingPath: codingPath, debugDescription: "Row id missing"))
    }
}

/// Encodes optionals as explicit JSON null so an edit can clear a field
/// (PostgREST ignores keys that are absent).
extension KeyedEncodingContainer {
    mutating func encodeNullable<T: Encodable>(_ value: T?, forKey key: Key) throws {
        if let value { try encode(value, forKey: key) } else { try encodeNil(forKey: key) }
    }
}
