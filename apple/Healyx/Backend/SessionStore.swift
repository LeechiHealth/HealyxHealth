import Foundation
import Observation
import Supabase

/// Sign-in state. Mirrors Supabase auth events so a refresh or sign-out anywhere
/// (including token expiry) updates the UI.
@MainActor
@Observable
final class SessionStore {
    enum State: Equatable { case loading, signedOut, signedIn }

    private(set) var state: State = .loading
    private(set) var userID: String?
    private(set) var email: String?
    private(set) var firstName: String?
    var errorMessage: String?
    var noticeMessage: String?
    private(set) var isWorking = false

    private let backend: HealyxBackend
    private var listener: Task<Void, Never>?

    init(backend: HealyxBackend = .shared) {
        self.backend = backend
        let auth = backend.supabase.auth
        listener = Task { [weak self] in
            for await (event, session) in auth.authStateChanges {
                await self?.handle(event, session)
            }
        }
    }

    private func handle(_ event: AuthChangeEvent, _ session: Session?) async {
        switch event {
        case .initialSession:
            guard session != nil else { apply(nil); return }
            // A stored session may have expired while the app was closed.
            // Asking for the current session refreshes it, or fails if it can't be.
            do { apply(try await backend.supabase.auth.session) } catch { apply(nil) }
        case .signedIn, .tokenRefreshed, .userUpdated:
            apply(session)
        case .signedOut:
            apply(nil)
        default:
            break
        }
    }

    private func apply(_ session: Session?) {
        guard let session else {
            state = .signedOut
            userID = nil
            email = nil
            firstName = nil
            return
        }
        userID = session.user.id.uuidString.lowercased()
        email = session.user.email
        firstName = Self.firstName(from: session.user.userMetadata)
        state = .signedIn
    }

    static func firstName(from metadata: [String: AnyJSON]) -> String? {
        for key in ["first_name", "full_name", "name"] {
            if case let .string(value)? = metadata[key],
               let first = value.split(separator: " ").first, !first.isEmpty {
                return String(first)
            }
        }
        return nil
    }

    func signIn(email: String, password: String) async {
        errorMessage = nil
        noticeMessage = nil
        isWorking = true
        defer { isWorking = false }
        do {
            _ = try await backend.supabase.auth.signIn(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password
            )
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    func signUp(firstName: String, email: String, password: String) async {
        errorMessage = nil
        noticeMessage = nil
        isWorking = true
        defer { isWorking = false }
        do {
            let name = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
            let response = try await backend.supabase.auth.signUp(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password,
                data: name.isEmpty ? nil : ["first_name": .string(name)]
            )
            if response.session == nil {
                noticeMessage = "Check your email to confirm your account, then sign in."
            }
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    func sendPasswordReset(email: String) async {
        errorMessage = nil
        noticeMessage = nil
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard address.contains("@") else {
            errorMessage = "Enter your email address first."
            return
        }
        do {
            try await backend.supabase.auth.resetPasswordForEmail(address)
            noticeMessage = "If that address has an account, a reset link is on its way."
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    func signOut() async {
        try? await backend.supabase.auth.signOut()
        apply(nil)
    }

    private static func message(for error: Error) -> String {
        if let urlError = error as? URLError, urlError.code == .notConnectedToInternet {
            return "You're offline. Connect to the internet and try again."
        }
        return error.localizedDescription
    }
}
