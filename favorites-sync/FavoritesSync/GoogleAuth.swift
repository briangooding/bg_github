import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

struct OAuthTokens: Codable {
    var accessToken: String
    var refreshToken: String
    var expiry: Date
}

enum AuthError: LocalizedError {
    case notConfigured
    case notSignedIn
    case cancelled
    case noRefreshToken
    case stateMismatch
    case google(String)
    case http(Int)

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Add your Google client ID to Local.xcconfig and rebuild."
        case .notSignedIn: return "Sign in to Google Drive again."
        case .cancelled: return "Sign-in was cancelled."
        case .noRefreshToken: return "Google didn't return a refresh token. Try signing in again."
        case .stateMismatch: return "Sign-in response didn't match the request."
        case .google(let message): return "Google sign-in failed: \(message)"
        case .http(let status): return "Google sign-in failed (HTTP \(status))."
        }
    }
}

/// Google OAuth for an iOS app: authorization code + PKCE in ASWebAuthenticationSession,
/// no client secret and no third-party SDK. Tokens live in the Keychain.
@MainActor
final class GoogleAuth: NSObject, ObservableObject {
    static let shared = GoogleAuth()

    @Published private(set) var tokens: OAuthTokens? {
        didSet { persistTokens() }
    }
    @Published private(set) var email: String? {
        didSet { UserDefaults.standard.set(email, forKey: "googleEmail") }
    }

    var isSignedIn: Bool { tokens != nil }

    private static let keychainAccount = "google-oauth"
    private var webSession: ASWebAuthenticationSession?
    private var refreshTask: Task<OAuthTokens, Error>?

    override init() {
        super.init()
        if let data = Keychain.load(account: Self.keychainAccount),
           let saved = try? JSONDecoder().decode(OAuthTokens.self, from: data) {
            tokens = saved
            email = UserDefaults.standard.string(forKey: "googleEmail")
        }
    }

    // MARK: Sign in / out

    func signIn() async throws {
        guard AppConfig.isConfigured else { throw AuthError.notConfigured }

        let verifier = Self.randomURLSafeString(byteCount: 32)
        let challenge = Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
        let state = Self.randomURLSafeString(byteCount: 16)

        var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: AppConfig.googleClientID),
            URLQueryItem(name: "redirect_uri", value: AppConfig.redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: AppConfig.driveScope),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "prompt", value: "consent"),
        ]

        let callback = try await presentWebSession(url: components.url!)
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ name: String) -> String? { items.first { $0.name == name }?.value }

        if let error = value("error") { throw AuthError.google(error) }
        guard value("state") == state else { throw AuthError.stateMismatch }
        guard let code = value("code") else { throw AuthError.google("no authorization code") }

        let response = try await tokenRequest([
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": verifier,
            "client_id": AppConfig.googleClientID,
            "redirect_uri": AppConfig.redirectURI,
        ])
        guard let refreshToken = response.refresh_token else { throw AuthError.noRefreshToken }
        tokens = OAuthTokens(
            accessToken: response.access_token,
            refreshToken: refreshToken,
            expiry: Date().addingTimeInterval(response.expires_in)
        )
        email = try? await DriveClient(auth: self, allowsExpensiveNetwork: true).accountEmail()
    }

    func signOut() async {
        if let token = tokens?.refreshToken {
            var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/revoke")!)
            request.httpMethod = "POST"
            request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            request.httpBody = Self.formEncode(["token": token]).data(using: .utf8)
            _ = try? await URLSession.shared.data(for: request)
        }
        tokens = nil
        email = nil
    }

    // MARK: Access tokens

    /// A valid access token, refreshing it first when it's about to expire.
    func accessToken(forceRefresh: Bool = false) async throws -> String {
        guard let current = tokens else { throw AuthError.notSignedIn }
        if !forceRefresh, current.expiry.timeIntervalSinceNow > 60 {
            return current.accessToken
        }
        if let refreshTask {
            return try await refreshTask.value.accessToken
        }
        let task = Task { try await self.refresh(using: current.refreshToken) }
        refreshTask = task
        defer { refreshTask = nil }
        return try await task.value.accessToken
    }

    private func refresh(using refreshToken: String) async throws -> OAuthTokens {
        do {
            let response = try await tokenRequest([
                "grant_type": "refresh_token",
                "refresh_token": refreshToken,
                "client_id": AppConfig.googleClientID,
            ])
            let updated = OAuthTokens(
                accessToken: response.access_token,
                refreshToken: response.refresh_token ?? refreshToken,
                expiry: Date().addingTimeInterval(response.expires_in)
            )
            tokens = updated
            return updated
        } catch AuthError.google(let code) where code == "invalid_grant" {
            // The refresh token was revoked or expired: the user has to sign in again.
            tokens = nil
            throw AuthError.notSignedIn
        }
    }

    // MARK: Helpers

    private struct TokenResponse: Decodable {
        let access_token: String
        let expires_in: Double
        let refresh_token: String?
    }

    private struct TokenError: Decodable {
        let error: String
    }

    private func tokenRequest(_ params: [String: String]) async throws -> TokenResponse {
        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = Self.formEncode(params).data(using: .utf8)
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else {
            if let error = try? JSONDecoder().decode(TokenError.self, from: data) {
                throw AuthError.google(error.error)
            }
            throw AuthError.http(status)
        }
        return try JSONDecoder().decode(TokenResponse.self, from: data)
    }

    private func presentWebSession(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: AppConfig.redirectScheme
            ) { callbackURL, error in
                if let callbackURL {
                    continuation.resume(returning: callbackURL)
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    continuation.resume(throwing: AuthError.cancelled)
                } else {
                    continuation.resume(throwing: error ?? AuthError.cancelled)
                }
            }
            session.presentationContextProvider = self
            webSession = session
            if !session.start() {
                continuation.resume(throwing: AuthError.cancelled)
            }
        }
    }

    private func persistTokens() {
        if let tokens, let data = try? JSONEncoder().encode(tokens) {
            Keychain.save(data, account: Self.keychainAccount)
        } else {
            Keychain.delete(account: Self.keychainAccount)
        }
    }

    static func formEncode(_ params: [String: String]) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return params.map { key, value in
            let k = key.addingPercentEncoding(withAllowedCharacters: allowed) ?? key
            let v = value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
            return "\(k)=\(v)"
        }.joined(separator: "&")
    }

    private static func randomURLSafeString(byteCount: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        _ = SecRandomCopyBytes(kSecRandomDefault, byteCount, &bytes)
        return base64URL(Data(bytes))
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

extension GoogleAuth: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first { $0.isKeyWindow } ?? ASPresentationAnchor()
        }
    }
}
