import Photos
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var engine: SyncEngine
    @EnvironmentObject private var auth: GoogleAuth
    @Environment(\.openURL) private var openURL

    @AppStorage(SettingsKey.folderName) private var folderName = AppConfig.defaultFolderName
    @AppStorage(SettingsKey.wifiOnly) private var wifiOnly = true
    @AppStorage(SettingsKey.removeUnfavorited) private var removeUnfavorited = false

    @State private var folderDraft = ""
    @State private var signInError: String?
    @State private var signingIn = false

    var body: some View {
        NavigationStack {
            Form {
                statusSection
                googleSection
                photosSection
                settingsSection
                if !engine.failures.isEmpty {
                    Section("Couldn't upload") {
                        ForEach(engine.failures, id: \.self) { Text($0).font(.footnote) }
                    }
                }
            }
            .navigationTitle("Favorites Sync")
            .refreshable { await engine.sync(userInitiated: true) }
            .safeAreaInset(edge: .bottom) { syncButton }
            .onAppear { folderDraft = folderName }
        }
    }

    // MARK: Sections

    private var statusSection: some View {
        Section {
            switch engine.status {
            case .idle:
                if let last = engine.lastSync {
                    Label("Last synced \(last.formatted(.relative(presentation: .named)))", systemImage: "clock")
                } else {
                    Label("Not synced yet", systemImage: "clock")
                }
            case .running(let done, let total):
                VStack(alignment: .leading, spacing: 8) {
                    Text(total == 0 ? "Checking favorites…" : "Uploading \(done) of \(total)")
                    ProgressView(value: total == 0 ? 0 : Double(done), total: Double(max(total, 1)))
                }
            case .waitingForWiFi:
                Label("Waiting for Wi‑Fi", systemImage: "wifi.exclamationmark")
            case .finished:
                Label("Up to date", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            case .failed(let message):
                Label(message, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
            }
            LabeledContent("Favorites", value: "\(engine.favoriteCount)")
            LabeledContent("In Google Drive", value: "\(engine.uploadedCount)")
        }
    }

    private var googleSection: some View {
        Section {
            if auth.isSignedIn {
                LabeledContent("Account", value: auth.email ?? "Signed in")
                Button("Sign Out", role: .destructive) {
                    Task { await auth.signOut() }
                }
            } else {
                Button {
                    signIn()
                } label: {
                    HStack {
                        Text("Sign in with Google")
                        if signingIn { Spacer(); ProgressView() }
                    }
                }
                .disabled(signingIn)
            }
            if let signInError {
                Text(signInError).font(.footnote).foregroundStyle(.red)
            }
        } header: {
            Text("Google Drive")
        } footer: {
            Text("The app can only see files it creates, not the rest of your Drive.")
        }
    }

    private var photosSection: some View {
        Section("Photos") {
            switch engine.photoAccess {
            case .notDetermined:
                Button("Allow Access to Photos") {
                    Task { await engine.requestPhotoAccess() }
                }
            case .authorized:
                Label("Full access", systemImage: "checkmark.circle")
            case .limited:
                Label("Limited access: only photos you picked are synced.", systemImage: "exclamationmark.circle")
                openSettingsButton("Allow Full Access")
            default:
                Label("Photo access is off.", systemImage: "xmark.circle")
                openSettingsButton("Open Settings")
            }
        }
    }

    private var settingsSection: some View {
        Section {
            LabeledContent("Drive folder") {
                TextField(AppConfig.defaultFolderName, text: $folderDraft)
                    .multilineTextAlignment(.trailing)
                    .submitLabel(.done)
                    .onSubmit(saveFolderName)
            }
            Toggle("Upload on Wi‑Fi only", isOn: $wifiOnly)
            Toggle("Remove from Drive when unfavorited", isOn: $removeUnfavorited)
        } header: {
            Text("Settings")
        } footer: {
            Text("Unfavorited photos go to the Drive trash, where you can restore them for 30 days.")
        }
    }

    private var syncButton: some View {
        Group {
            if case .running = engine.status {
                Button("Stop", role: .cancel) { engine.cancel() }
                    .buttonStyle(.bordered)
            } else {
                Button {
                    Task { await engine.sync(userInitiated: true) }
                } label: {
                    Label("Sync Now", systemImage: "arrow.triangle.2.circlepath")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!auth.isSignedIn || !engine.hasPhotoAccess)
            }
        }
        .controlSize(.large)
        .padding()
        .background(.bar)
    }

    // MARK: Actions

    private func openSettingsButton(_ title: String) -> some View {
        Button(title) {
            if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
        }
    }

    private func saveFolderName() {
        let trimmed = folderDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        folderName = trimmed.isEmpty ? AppConfig.defaultFolderName : trimmed
        folderDraft = folderName
    }

    private func signIn() {
        signInError = nil
        signingIn = true
        Task {
            defer { signingIn = false }
            do {
                try await auth.signIn()
                await engine.sync(userInitiated: true)
            } catch AuthError.cancelled {
                // User closed the sheet.
            } catch {
                signInError = error.localizedDescription
            }
        }
    }
}
