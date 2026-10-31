# Favorites Sync

An iPhone app that copies every photo and video you mark as a **Favorite** (the heart) in the
Photos app to a folder in your Google Drive, and keeps copying new favorites as you add them.

Unlike the other apps in this repo, this is a native iOS app, not a web page. A web page can't
read your photo library, so it has no way to know which photos are favorites. Only an app using
Apple's PhotoKit can.

## What it does

- Finds all favorites (photos and videos), oldest first, and uploads any that aren't in Drive yet
  to a folder (default **iPhone Favorites**).
- Uploads the **edited** version if you edited the photo, the original otherwise. Files keep their
  format (HEIC, JPEG, MOV…) and are named like `2026-10-31 12.07.33 IMG_1234.HEIC`, with the
  Drive created date set to when the photo was taken.
- Downloads originals from iCloud first if your phone uses *Optimize iPhone Storage*.
- Syncs when you open the app, a few seconds after you heart or un-heart a photo while it's open,
  and in the background whenever iOS allows it.
- Never uploads the same photo twice. Each Drive file is tagged with the photo's ID, so even after a
  reinstall it picks up where it left off.
- Optional: **Wi‑Fi only** (on by default) and **Remove from Drive when unfavorited**, which moves
  the file to the Drive trash.
- Uses the `drive.file` permission: the app can only see files it created, not the rest of your Drive.
  Sign-in uses Google's standard OAuth (PKCE). Tokens are stored in the iOS Keychain. There's no
  server and no third-party SDK.

## Setup

You need a Mac with Xcode 15 or newer, an iPhone on iOS 17 or newer, and a Google account.

### 1. Create a Google OAuth client (one time)

1. Go to <https://console.cloud.google.com/> and create a project, for example "Favorites Sync".
2. **APIs & Services → Library**: enable the **Google Drive API**.
3. **Google Auth Platform → Branding / Audience** (called *OAuth consent screen* in older consoles):
   - User type **External**. Fill in the app name and your email.
   - On **Data Access**, add the scope `https://www.googleapis.com/auth/drive.file`.
   - On **Audience**, click **Publish app** so it's *In production*. While an app is in *Testing*,
     Google expires its sign-ins after 7 days, so you'd have to sign in again every week.
     `drive.file` is a non-sensitive scope, so publishing doesn't need Google's review. If Google
     shows an "unverified app" screen when you sign in, tap **Advanced → Go to Favorites Sync**.
4. **Clients → Create client**, type **iOS**. Set the **Bundle ID**, for example
   `com.yourname.favoritessync`. Copy the client ID, which looks like
   `1234-abcd.apps.googleusercontent.com`.

### 2. Configure and build

```sh
brew install xcodegen          # generates the .xcodeproj from project.yml
cd favorites-sync
cp Local.example.xcconfig Local.xcconfig
# Edit Local.xcconfig:
#   APP_BUNDLE_ID           = the bundle ID from step 1.4
#   GOOGLE_CLIENT_ID_PREFIX = the client ID without ".apps.googleusercontent.com"
#   DEVELOPMENT_TEAM        = your Apple team ID (optional; you can pick it in Xcode instead)
xcodegen generate
open FavoritesSync.xcodeproj
```

In Xcode, choose your iPhone as the run destination and press **Run**. On the target's
*Signing & Capabilities* tab, pick your team if you didn't set `DEVELOPMENT_TEAM`.

- With a **free Apple ID**, apps you install yourself stop opening after 7 days. Run from
  Xcode again to renew it.
- With a paid **Apple Developer Program** membership the install lasts a year, and you can use
  TestFlight.

The first time you run it on the phone you may need to trust your developer certificate:
*Settings → General → VPN & Device Management*.

### 3. Use it

1. Tap **Sign in with Google** and allow access.
2. Tap **Allow Access to Photos** and choose **Allow Full Access**. With *Limited* access the app
   only sees the photos you picked.
3. The first sync starts automatically. Keep the app open for a big first upload, since iOS
   gives background work only short, unpredictable windows.

## Good to know

- **Background syncing is up to iOS.** Apps can't run all the time. The app asks for
  background time, and iOS grants it based on how often you use the app, battery and network,
  often overnight while charging. Opening the app always syncs right away.
- **Live Photos** upload as the still image only.
- **Changing the folder name** starts syncing into the new folder. Photos already in that folder
  aren't uploaded again. The old folder is left alone.
- **New phone:** photo IDs are per device, so a new phone uploads its favorites again as new files.
- If some items fail (for example an iCloud download fails), the app lists them and tries again on
  the next sync.

## No-Xcode alternative: an iOS Shortcut

If you don't want to build an app, the built-in Shortcuts app can do a simpler version.
Install the Google Drive app and enable it in *Files* first.

1. New shortcut: **Find Photos** where **Is Favorite** is true.
2. **Save File**: pass it the found photos. Turn off *Ask Where to Save*, choose a folder in
   Google Drive, and turn on *Overwrite If File Exists*.
3. In **Automation**, run it daily at a set time.

This re-copies every favorite each time and only runs while the phone is unlocked, which is
why this app exists. It works fine for a small number of favorites, though.

## Code

| File | What it does |
|---|---|
| `FavoritesSync/SyncEngine.swift` | Finds what's new, uploads it, records progress, trashes unfavorited items |
| `FavoritesSync/PhotoLibrary.swift` | PhotoKit: favorites query, exports files (from iCloud if needed), change observer |
| `FavoritesSync/DriveClient.swift` | Drive v3 REST: folder, duplicate check, resumable upload, trash, with retries |
| `FavoritesSync/GoogleAuth.swift` | OAuth sign-in with PKCE through `ASWebAuthenticationSession`, token refresh, Keychain |
| `FavoritesSync/BackgroundSync.swift` | Background refresh and processing tasks |
| `FavoritesSync/ContentView.swift` | The single settings and status screen |
| `project.yml`, `Config.xcconfig` | XcodeGen project and build settings (your values go in `Local.xcconfig`) |
