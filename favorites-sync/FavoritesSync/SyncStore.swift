import Foundation

struct SyncState: Codable {
    var folderID: String?
    var folderName: String?
    /// Photos library local identifier -> Drive file ID, for everything uploaded to the current folder.
    var uploaded: [String: String] = [:]
    var lastSync: Date?
}

/// Remembers what has been uploaded, in a JSON file in Application Support.
@MainActor
final class SyncStore {
    private(set) var state: SyncState
    private let fileURL: URL

    init() {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        fileURL = directory.appendingPathComponent("sync-state.json")
        if let data = try? Data(contentsOf: fileURL),
           let saved = try? JSONDecoder().decode(SyncState.self, from: data) {
            state = saved
        } else {
            state = SyncState()
        }
    }

    func update(_ change: (inout SyncState) -> Void) {
        change(&state)
        if let data = try? JSONEncoder().encode(state) {
            try? data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }
}
