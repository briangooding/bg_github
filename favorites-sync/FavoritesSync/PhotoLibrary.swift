import Foundation
import Photos
import UniformTypeIdentifiers

enum PhotoError: LocalizedError {
    case noResource

    var errorDescription: String? { "This item has no file that can be exported." }
}

struct ExportedAsset {
    let url: URL
    let filename: String
    let mimeType: String
}

enum PhotoLibrary {
    static var authorization: PHAuthorizationStatus {
        PHPhotoLibrary.authorizationStatus(for: .readWrite)
    }

    static func requestAccess() async -> PHAuthorizationStatus {
        await PHPhotoLibrary.requestAuthorization(for: .readWrite)
    }

    /// Every photo and video marked as a Favorite, oldest first.
    static func favoritesFetchResult() -> PHFetchResult<PHAsset> {
        let options = PHFetchOptions()
        options.predicate = NSPredicate(format: "favorite == YES")
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
        return PHAsset.fetchAssets(with: options)
    }

    static func favoriteAssets() -> [PHAsset] {
        let result = favoritesFetchResult()
        return result.count == 0 ? [] : result.objects(at: IndexSet(integersIn: 0..<result.count))
    }

    /// Writes the asset's file to `directory`, downloading it from iCloud if needed.
    /// Uses the edited version when there is one, so Drive gets what you see in Photos.
    static func export(_ asset: PHAsset, into directory: URL) async throws -> ExportedAsset {
        let resources = PHAssetResource.assetResources(for: asset)
        let preferred: [PHAssetResourceType] = asset.mediaType == .video
            ? [.fullSizeVideo, .video]
            : [.fullSizePhoto, .photo]
        let match = preferred.lazy.compactMap { type in resources.first { $0.type == type } }.first
        guard let resource = match ?? resources.first else { throw PhotoError.noResource }

        // Edited files are named like "FullSizeRender.jpg", so take the name from the original.
        let original = resources.first { $0.type == .photo || $0.type == .video } ?? resource
        let type = UTType(resource.uniformTypeIdentifier)
        let ext = type?.preferredFilenameExtension ?? (resource.originalFilename as NSString).pathExtension
        let baseName = (original.originalFilename as NSString).deletingPathExtension

        var name = baseName
        if let date = asset.creationDate {
            name = "\(fileDateFormatter.string(from: date)) \(baseName)"
        }
        if !ext.isEmpty { name += ".\(ext)" }

        let url = directory.appendingPathComponent(UUID().uuidString).appendingPathExtension(ext)
        try await write(resource, to: url)
        return ExportedAsset(url: url, filename: name, mimeType: type?.preferredMIMEType ?? "application/octet-stream")
    }

    private static func write(_ resource: PHAssetResource, to url: URL) async throws {
        let options = PHAssetResourceRequestOptions()
        options.isNetworkAccessAllowed = true  // "Optimize iPhone Storage" keeps originals in iCloud
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            PHAssetResourceManager.default().writeData(for: resource, toFile: url, options: options) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    private static let fileDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd HH.mm.ss"
        return formatter
    }()
}

/// Calls back whenever the set of favorites changes while the app is running.
final class FavoritesObserver: NSObject, PHPhotoLibraryChangeObserver {
    private var fetchResult: PHFetchResult<PHAsset>
    private let onChange: @MainActor () -> Void

    init(onChange: @escaping @MainActor () -> Void) {
        self.fetchResult = PhotoLibrary.favoritesFetchResult()
        self.onChange = onChange
        super.init()
        PHPhotoLibrary.shared().register(self)
    }

    deinit {
        PHPhotoLibrary.shared().unregisterChangeObserver(self)
    }

    func photoLibraryDidChange(_ changeInstance: PHChange) {
        guard let details = changeInstance.changeDetails(for: fetchResult) else { return }
        fetchResult = details.fetchResultAfterChanges
        let onChange = self.onChange
        Task { @MainActor in onChange() }
    }
}
