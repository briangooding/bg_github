import Foundation

/// Values that come from Info.plist (filled in from Config.xcconfig / Local.xcconfig) and settings keys.
enum AppConfig {
    static let googleClientID: String =
        Bundle.main.object(forInfoDictionaryKey: "GoogleClientID") as? String ?? ""

    /// The client ID with its parts reversed, which Google uses as the iOS redirect scheme.
    /// "1234-abcd.apps.googleusercontent.com" -> "com.googleusercontent.apps.1234-abcd"
    static var redirectScheme: String {
        googleClientID.split(separator: ".").reversed().joined(separator: ".")
    }

    static var redirectURI: String { "\(redirectScheme):/oauthredirect" }

    static var isConfigured: Bool {
        !googleClientID.isEmpty && !googleClientID.hasPrefix("YOUR_") && !googleClientID.hasPrefix("$(")
    }

    /// Only files this app creates are visible to it, which keeps the rest of your Drive private.
    static let driveScope = "https://www.googleapis.com/auth/drive.file"

    static let defaultFolderName = "iPhone Favorites"
}

enum SettingsKey {
    static let folderName = "folderName"
    static let wifiOnly = "wifiOnly"
    static let removeUnfavorited = "removeUnfavorited"
}

struct SyncSettings {
    var folderName: String
    var wifiOnly: Bool
    var removeUnfavorited: Bool

    static var current: SyncSettings {
        let defaults = UserDefaults.standard
        let name = (defaults.string(forKey: SettingsKey.folderName) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return SyncSettings(
            folderName: name.isEmpty ? AppConfig.defaultFolderName : name,
            wifiOnly: defaults.object(forKey: SettingsKey.wifiOnly) as? Bool ?? true,
            removeUnfavorited: defaults.bool(forKey: SettingsKey.removeUnfavorited)
        )
    }
}
