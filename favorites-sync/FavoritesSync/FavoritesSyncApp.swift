import SwiftUI

@main
struct FavoritesSyncApp: App {
    @StateObject private var engine = SyncEngine.shared
    @StateObject private var auth = GoogleAuth.shared
    @Environment(\.scenePhase) private var scenePhase

    init() {
        BackgroundSync.register()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(engine)
                .environmentObject(auth)
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                Task { await engine.sync() }
            case .background:
                BackgroundSync.schedule()
            default:
                break
            }
        }
    }
}
