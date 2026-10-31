import Foundation
import Security

/// Tiny wrapper for storing the Google tokens in the Keychain.
enum Keychain {
    private static let service = Bundle.main.bundleIdentifier ?? "FavoritesSync"

    private static func baseQuery(_ account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    static func save(_ data: Data, account: String) {
        let query = baseQuery(account)
        SecItemDelete(query as CFDictionary)
        var item = query
        item[kSecValueData as String] = data
        // Readable while the phone is locked (after first unlock) so background syncs work.
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }

    static func load(account: String) -> Data? {
        var query = baseQuery(account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }

    static func delete(account: String) {
        SecItemDelete(baseQuery(account) as CFDictionary)
    }
}
