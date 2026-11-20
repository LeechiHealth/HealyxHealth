import Foundation
import Security
import Supabase
import HealyxKit

/// Owns the two connections the app needs:
/// - `supabase`: sign-in plus direct reads/writes of the person's own rows (RLS-protected)
/// - `api`: the Healyx web API for AI features, authenticated with the same session
final class HealyxBackend: Sendable {
    static let shared = HealyxBackend()

    let supabase: SupabaseClient
    let api: HealyxAPI

    init() {
        let client = SupabaseClient(
            supabaseURL: AppConfig.supabaseURL,
            supabaseKey: AppConfig.supabaseKey,
            options: SupabaseClientOptions(
                auth: SupabaseClientOptions.AuthOptions(
                    storage: KeychainSessionStorage(),
                    // Emit the stored session at launch; SessionStore refreshes or rejects it.
                    emitLocalSessionAsInitialSession: true
                )
            )
        )
        supabase = client
        // `auth.session` refreshes an expired access token before returning it.
        api = HealyxAPI(baseURL: AppConfig.apiBaseURL) {
            try await client.auth.session.accessToken
        }
    }
}

/// Stores the Supabase session in the Keychain.
/// Uses the standard (non data-protection) keychain on macOS so the app also works
/// when it is signed to run locally without a development team.
struct KeychainSessionStorage: AuthLocalStorage {
    private let service = "health.healyx.app.session"

    struct KeychainError: LocalizedError {
        let status: OSStatus
        var errorDescription: String? { "Keychain error \(status)" }
    }

    private func query(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }

    func store(key: String, value: Data) throws {
        let status = SecItemUpdate(query(key) as CFDictionary, [kSecValueData as String: value] as CFDictionary)
        if status == errSecItemNotFound {
            var item = query(key)
            item[kSecValueData as String] = value
            #if os(iOS)
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            #endif
            let added = SecItemAdd(item as CFDictionary, nil)
            guard added == errSecSuccess else { throw KeychainError(status: added) }
        } else if status != errSecSuccess {
            throw KeychainError(status: status)
        }
    }

    func retrieve(key: String) throws -> Data? {
        var item = query(key)
        item[kSecReturnData as String] = true
        item[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(item as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw KeychainError(status: status) }
        return result as? Data
    }

    func remove(key: String) throws {
        let status = SecItemDelete(query(key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainError(status: status) }
    }
}
