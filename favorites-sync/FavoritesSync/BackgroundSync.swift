import BackgroundTasks
import Foundation

/// iOS decides when background work runs: a short refresh now and then, and longer
/// processing windows (usually overnight while charging). Both just run a sync.
enum BackgroundSync {
    private static let prefix = Bundle.main.bundleIdentifier ?? "FavoritesSync"
    static let refreshID = prefix + ".refresh"
    static let processingID = prefix + ".processing"

    /// Must be called before the app finishes launching.
    static func register() {
        for id in [refreshID, processingID] {
            BGTaskScheduler.shared.register(forTaskWithIdentifier: id, using: .main) { task in
                MainActor.assumeIsolated { handle(task) }
            }
        }
    }

    static func schedule() {
        let refresh = BGAppRefreshTaskRequest(identifier: refreshID)
        refresh.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(refresh)

        let processing = BGProcessingTaskRequest(identifier: processingID)
        processing.requiresNetworkConnectivity = true
        processing.requiresExternalPower = false
        try? BGTaskScheduler.shared.submit(processing)
    }

    @MainActor
    private static func handle(_ task: BGTask) {
        schedule()  // queue the next one
        let work = Task { @MainActor in
            await SyncEngine.shared.sync()
            task.setTaskCompleted(success: SyncEngine.shared.status == .finished)
        }
        task.expirationHandler = { work.cancel() }
    }
}
