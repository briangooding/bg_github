import Foundation

enum DriveError: LocalizedError {
    case http(Int, String)
    case badResponse

    var errorDescription: String? {
        switch self {
        case .http(let status, let body):
            if let message = Self.googleMessage(in: body) { return "Google Drive: \(message)" }
            return "Google Drive error (HTTP \(status))."
        case .badResponse:
            return "Unexpected response from Google Drive."
        }
    }

    var status: Int? {
        if case .http(let status, _) = self { return status }
        return nil
    }

    private static func googleMessage(in body: String) -> String? {
        struct Envelope: Decodable { struct Inner: Decodable { let message: String? }; let error: Inner? }
        return (try? JSONDecoder().decode(Envelope.self, from: Data(body.utf8)))?.error?.message
    }
}

/// The few Google Drive v3 REST calls the app needs.
@MainActor
final class DriveClient {
    private let auth: GoogleAuth
    private let session: URLSession

    private static let filesURL = "https://www.googleapis.com/drive/v3/files"
    private static let uploadURL = "https://www.googleapis.com/upload/drive/v3/files"
    private static let folderMIME = "application/vnd.google-apps.folder"

    init(auth: GoogleAuth, allowsExpensiveNetwork: Bool) {
        self.auth = auth
        let config = URLSessionConfiguration.default
        // "Expensive" = cellular or a personal hotspot. Turning it off makes requests fail
        // with URLError.networkUnavailableReason == .expensive, which the engine reports as "waiting for Wi-Fi".
        config.allowsExpensiveNetworkAccess = allowsExpensiveNetwork
        config.timeoutIntervalForRequest = 120
        self.session = URLSession(configuration: config)
    }

    // MARK: Calls

    func accountEmail() async throws -> String? {
        struct About: Decodable { struct User: Decodable { let emailAddress: String? }; let user: User? }
        let url = Self.url("https://www.googleapis.com/drive/v3/about", ["fields": "user(emailAddress)"])
        let (data, _) = try await send { try self.request(url, token: $0) }
        return try JSONDecoder().decode(About.self, from: data).user?.emailAddress
    }

    /// True when the folder still exists and isn't in the trash.
    func isActiveFolder(_ id: String) async throws -> Bool {
        struct Meta: Decodable { let trashed: Bool? }
        let url = Self.url("\(Self.filesURL)/\(id)", ["fields": "id,trashed"])
        do {
            let (data, _) = try await send { try self.request(url, token: $0) }
            return try JSONDecoder().decode(Meta.self, from: data).trashed != true
        } catch let error as DriveError where error.status == 404 {
            return false
        }
    }

    func findOrCreateFolder(named name: String) async throws -> String {
        let query = "mimeType='\(Self.folderMIME)' and name='\(Self.escape(name))' and trashed=false"
        if let existing = try await firstFile(matching: query) { return existing }

        let url = Self.url(Self.filesURL, ["fields": "id"])
        let body: [String: Any] = ["name": name, "mimeType": Self.folderMIME]
        let (data, _) = try await send { try self.request(url, method: "POST", token: $0, json: body) }
        return try JSONDecoder().decode(FileID.self, from: data).id
    }

    /// A file this app already uploaded for the given photo, if there is one.
    /// Lets a reinstall (or a lost sync record) pick up where it left off without duplicates.
    func existingFile(assetID: String, folderID: String) async throws -> String? {
        let query = "appProperties has { key='assetId' and value='\(Self.escape(assetID))' }"
            + " and '\(Self.escape(folderID))' in parents and trashed=false"
        return try await firstFile(matching: query)
    }

    /// Uploads a file with a resumable upload, which streams from disk and handles large videos.
    func upload(
        file: URL,
        name: String,
        mimeType: String,
        folderID: String,
        createdAt: Date?,
        appProperties: [String: String]
    ) async throws -> String {
        let size = (try FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber)?.int64Value ?? 0

        var metadata: [String: Any] = [
            "name": name,
            "parents": [folderID],
            "mimeType": mimeType,
            "appProperties": appProperties,
        ]
        if let createdAt {
            let stamp = ISO8601DateFormatter().string(from: createdAt)
            metadata["createdTime"] = stamp
            metadata["modifiedTime"] = stamp
        }

        let startURL = Self.url(Self.uploadURL, ["uploadType": "resumable", "fields": "id"])
        let (_, startResponse) = try await send { token in
            var request = try self.request(startURL, method: "POST", token: token, json: metadata)
            request.setValue(mimeType, forHTTPHeaderField: "X-Upload-Content-Type")
            request.setValue(String(size), forHTTPHeaderField: "X-Upload-Content-Length")
            return request
        }
        guard let location = startResponse.value(forHTTPHeaderField: "Location"),
              let sessionURL = URL(string: location) else { throw DriveError.badResponse }

        let (data, _) = try await send(uploading: file) { token in
            var request = try self.request(sessionURL, method: "PUT", token: token)
            request.setValue(mimeType, forHTTPHeaderField: "Content-Type")
            request.timeoutInterval = 600
            return request
        }
        return try JSONDecoder().decode(FileID.self, from: data).id
    }

    func trash(fileID: String) async throws {
        let url = Self.url("\(Self.filesURL)/\(fileID)", ["fields": "id"])
        do {
            _ = try await send { try self.request(url, method: "PATCH", token: $0, json: ["trashed": true]) }
        } catch let error as DriveError where error.status == 404 {
            // Already gone.
        }
    }

    // MARK: Plumbing

    private struct FileID: Decodable { let id: String }

    private func firstFile(matching query: String) async throws -> String? {
        struct FileList: Decodable { let files: [FileID] }
        let url = Self.url(Self.filesURL, [
            "q": query,
            "fields": "files(id)",
            "pageSize": "1",
            "spaces": "drive",
        ])
        let (data, _) = try await send { try self.request(url, token: $0) }
        return try JSONDecoder().decode(FileList.self, from: data).files.first?.id
    }

    private func request(_ url: URL, method: String = "GET", token: String, json: Any? = nil) throws -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let json {
            request.setValue("application/json; charset=UTF-8", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        return request
    }

    /// Sends a request, refreshing the token once on 401 and backing off on rate limits / server errors.
    private func send(
        uploading file: URL? = nil,
        _ makeRequest: (String) throws -> URLRequest
    ) async throws -> (Data, HTTPURLResponse) {
        var token = try await auth.accessToken()
        var refreshed = false
        var delay: UInt64 = 1_000_000_000

        for attempt in 0..<5 {
            let request = try makeRequest(token)
            let (data, response): (Data, URLResponse)
            if let file {
                (data, response) = try await session.upload(for: request, fromFile: file)
            } else {
                (data, response) = try await session.data(for: request)
            }
            guard let http = response as? HTTPURLResponse else { throw DriveError.badResponse }

            switch http.statusCode {
            case 200..<300:
                return (data, http)
            case 401 where !refreshed:
                refreshed = true
                token = try await auth.accessToken(forceRefresh: true)
            case 403, 429, 500, 502, 503, 504:
                guard attempt < 4, Self.isRetryable(http.statusCode, data) else {
                    throw DriveError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
                }
                try await Task.sleep(nanoseconds: delay)
                delay *= 2
            default:
                throw DriveError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
            }
        }
        throw DriveError.badResponse
    }

    /// 429 and 5xx are always retryable; a 403 is only when Drive says it's a rate limit.
    private static func isRetryable(_ status: Int, _ data: Data) -> Bool {
        guard status == 403 else { return true }
        let body = String(data: data, encoding: .utf8) ?? ""
        return body.contains("rateLimitExceeded") || body.contains("userRateLimitExceeded")
    }

    private static func url(_ base: String, _ params: [String: String]) -> URL {
        URL(string: base + "?" + GoogleAuth.formEncode(params))!
    }

    /// Escapes a value for use inside single quotes in a Drive query.
    private static func escape(_ value: String) -> String {
        value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
    }
}
