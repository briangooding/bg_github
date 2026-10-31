import Foundation
import Photos

@MainActor
final class SyncEngine: ObservableObject {
    static let shared = SyncEngine()

    enum Status: Equatable {
        case idle
        case running(done: Int, total: Int)
        case waitingForWiFi
        case finished
        case failed(String)
    }

    @Published private(set) var status: Status = .idle
    @Published private(set) var favoriteCount = 0
    @Published private(set) var uploadedCount = 0
    @Published private(set) var lastSync: Date?
    @Published private(set) var failures: [String] = []
    @Published private(set) var photoAccess: PHAuthorizationStatus = PhotoLibrary.authorization

    private let auth = GoogleAuth.shared
    private let store = SyncStore()
    private var current: Task<Void, Never>?
    private var observer: FavoritesObserver?
    private var pendingChangeSync: Task<Void, Never>?

    var hasPhotoAccess: Bool { photoAccess == .authorized || photoAccess == .limited }

    init() {
        uploadedCount = store.state.uploaded.count
        lastSync = store.state.lastSync
        refresh()
    }

    /// Re-reads photo permission and the favorite count, and starts watching for changes.
    func refresh() {
        photoAccess = PhotoLibrary.authorization
        guard hasPhotoAccess else { return }
        favoriteCount = PhotoLibrary.favoritesFetchResult().count
        if observer == nil {
            observer = FavoritesObserver { [weak self] in self?.favoritesChanged() }
        }
    }

    func requestPhotoAccess() async {
        _ = await PhotoLibrary.requestAccess()
        refresh()
        await sync()
    }

    /// Runs a sync, or waits for the one already running.
    /// Automatic syncs stay quiet when the app isn't set up yet; `userInitiated` ones explain why.
    func sync(userInitiated: Bool = false) async {
        refresh()
        guard auth.isSignedIn, hasPhotoAccess else {
            if userInitiated {
                status = .failed(auth.isSignedIn ? "Allow access to Photos first." : "Sign in to Google Drive first.")
            }
            return
        }
        if current == nil {
            current = Task {
                await self.run()
                self.current = nil
            }
        }
        guard let task = current else { return }
        await withTaskCancellationHandler {
            await task.value
        } onCancel: {
            task.cancel()
        }
    }

    func cancel() {
        current?.cancel()
    }

    private func favoritesChanged() {
        refresh()
        pendingChangeSync?.cancel()
        pendingChangeSync = Task {
            // Let a burst of hearts settle before syncing.
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            guard !Task.isCancelled else { return }
            await self.sync()
        }
    }

    // MARK: The sync itself

    private func run() async {
        let settings = SyncSettings.current
        let drive = DriveClient(auth: auth, allowsExpensiveNetwork: !settings.wifiOnly)
        let tempDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("uploads-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: tempDirectory) }

        failures = []
        status = .running(done: 0, total: 0)

        do {
            let folderID = try await resolveFolder(named: settings.folderName, drive: drive)
            let favorites = PhotoLibrary.favoriteAssets()
            favoriteCount = favorites.count

            let pending = favorites.filter { store.state.uploaded[$0.localIdentifier] == nil }
            status = .running(done: 0, total: pending.count)

            for (index, asset) in pending.enumerated() {
                try Task.checkCancellation()
                do {
                    try await upload(asset, folderID: folderID, drive: drive, tempDirectory: tempDirectory)
                } catch let error where Self.stopsTheSync(error) {
                    throw error
                } catch {
                    // One bad file (say, an iCloud download that failed) shouldn't stop the rest.
                    let date = asset.creationDate?.formatted(date: .abbreviated, time: .shortened) ?? "Unknown date"
                    failures.append("\(date): \(error.localizedDescription)")
                }
                status = .running(done: index + 1, total: pending.count)
            }

            // With limited access, favorites we can't see would look unfavorited, so only trash with full access.
            if settings.removeUnfavorited, photoAccess == .authorized {
                try await trashUnfavorited(keeping: favorites, drive: drive)
            }

            store.update { $0.lastSync = Date() }
            lastSync = store.state.lastSync
            status = failures.isEmpty ? .finished : .failed("\(failures.count) item(s) couldn't be uploaded.")
        } catch {
            if Task.isCancelled || error is CancellationError || (error as? URLError)?.code == .cancelled {
                status = .idle
            } else if let urlError = error as? URLError,
                      urlError.networkUnavailableReason == .expensive || urlError.networkUnavailableReason == .constrained {
                status = .waitingForWiFi
            } else {
                status = .failed(error.localizedDescription)
            }
        }
        uploadedCount = store.state.uploaded.count
    }

    private func resolveFolder(named name: String, drive: DriveClient) async throws -> String {
        if let id = store.state.folderID, store.state.folderName == name, try await drive.isActiveFolder(id) {
            return id
        }
        let id = try await drive.findOrCreateFolder(named: name)
        store.update { state in
            if state.folderID != id {
                // New folder: start over. existingFile(...) keeps this from re-uploading
                // anything that's already in that folder.
                state.uploaded = [:]
            }
            state.folderID = id
            state.folderName = name
        }
        return id
    }

    private func upload(_ asset: PHAsset, folderID: String, drive: DriveClient, tempDirectory: URL) async throws {
        let key = asset.localIdentifier

        if let existing = try await drive.existingFile(assetID: key, folderID: folderID) {
            store.update { $0.uploaded[key] = existing }
            uploadedCount = store.state.uploaded.count
            return
        }

        let exported = try await PhotoLibrary.export(asset, into: tempDirectory)
        defer { try? FileManager.default.removeItem(at: exported.url) }

        let fileID = try await drive.upload(
            file: exported.url,
            name: exported.filename,
            mimeType: exported.mimeType,
            folderID: folderID,
            createdAt: asset.creationDate,
            appProperties: ["assetId": key]
        )
        store.update { $0.uploaded[key] = fileID }
        uploadedCount = store.state.uploaded.count
    }

    private func trashUnfavorited(keeping favorites: [PHAsset], drive: DriveClient) async throws {
        let favoriteIDs = Set(favorites.map(\.localIdentifier))
        for (assetID, fileID) in store.state.uploaded where !favoriteIDs.contains(assetID) {
            try Task.checkCancellation()
            try await drive.trash(fileID: fileID)
            store.update { $0.uploaded[assetID] = nil }
        }
    }

    /// Errors that will hit every file the same way, so there's no point trying the rest.
    private static func stopsTheSync(_ error: Error) -> Bool {
        if error is AuthError || error is CancellationError { return true }
        if let urlError = error as? URLError {
            return [.cancelled, .notConnectedToInternet, .networkConnectionLost, .timedOut,
                    .cannotFindHost, .cannotConnectToHost].contains(urlError.code)
                || urlError.networkUnavailableReason != nil
        }
        if let driveError = error as? DriveError, let status = driveError.status {
            return status == 401 || status == 403
        }
        return false
    }
}
