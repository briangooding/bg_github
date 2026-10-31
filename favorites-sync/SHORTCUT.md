# Favorites to Google Drive with a Shortcut (free)

This copies your favorited photos and videos to a Google Drive folder using the built-in
Shortcuts app. It needs no Mac, no developer account and no app install other than Google Drive.
It runs on its own every time you close the Photos app, and it only copies favorites that aren't
in Drive yet.

How it avoids copying the same photo twice: it keeps a list of what it has saved in a small file,
`synced.txt`, next to the photos in Drive. Each photo is saved with a unique name (the date taken
plus the original name, like `2026-10-31 12.07.33 IMG_1234.heic`), and anything already on the
list is skipped.

## 1. Connect Google Drive to the Files app (one time)

1. Install **Google Drive** from the App Store and sign in.
2. Open the **Files** app, tap **Browse**, tap **⋯** (top right), then **Edit**. Turn on **Drive** and tap **Done**.
3. In Files, open **Drive → My Drive** and create a folder named **iPhone Favorites**.

## 2. Build the shortcut

Open **Shortcuts**, tap **+**, and name it **Favorites to Drive**. Add these actions in order.
Use the search bar at the bottom to find each one. A word in *[brackets]* means "tap the field and
pick that variable" (magic variables appear above the keyboard when you tap a field).

**Load the list of what's already saved**

1. **Get File from Folder**
   - Folder: tap and pick **Drive → My Drive → iPhone Favorites**
   - File path: `synced.txt`
   - Tap the arrow to show more options and turn **Error If Not Found** **off**
2. **Get Text from Input**: input is *[File]* from step 1.
3. **Set Variable**: name it `Synced`, value *[Text]*.

**Find favorites**

4. **Find Photos**
   - Tap **Add Filter** → **Is Favorite** → **is** → on
   - Sort by **Date Taken**, Order **Oldest First**
   - (Optional) add filter **Media Type is Image** to skip videos, which are slow over Drive.

**Save each one that's new**

5. **Repeat with Each** item in *[Photos]*. Put steps 6–16 *inside* the repeat.
6. **Get Details of Images**: detail **Date Taken**, of *[Repeat Item]*.
7. **Format Date**: *[Date Taken]*. Date Format **Custom**, format string `yyyy-MM-dd HH.mm.ss`.
8. **Get Details of Images**: detail **Name**, of *[Repeat Item]*.
9. **Text**: *[Formatted Date]* then a space then *[Name]*.
10. **Set Variable**: name it `File Name`, value *[Text]*.
11. **If** *[Synced]* **does not contain** *[File Name]*. Steps 12–16 go *inside* the If, before
    **Otherwise**. Leave Otherwise empty.
12. **Set Name** of *[Repeat Item]* to *[File Name]*. Leave *Don't Include File Extension* **off**.
13. **Save File**: *[Renamed Item]*
    - Turn **Ask Where to Save** **off**
    - Folder: **Drive → My Drive → iPhone Favorites**
    - Turn **Overwrite If File Exists** **on**
14. **Text**: *[Synced]*, press Return for a new line, then *[File Name]*.
    Then **Set Variable** `Synced` to this *[Text]*.
15. **Set Name** of *[Synced]* to `synced.txt`. Show more and turn **Don't Include File Extension** **on**.
16. **Save File**: *[Renamed Item]* from step 15. **Ask Where to Save** off, folder
    **iPhone Favorites**, **Overwrite If File Exists** on.

That's everything (**End If** and **End Repeat** were added for you). At a glance:

```
Get File "synced.txt" from iPhone Favorites      (Error If Not Found: off)
Get Text from File  → Set Variable Synced
Find Photos where Is Favorite, oldest first
Repeat with each photo
    Date Taken → Format "yyyy-MM-dd HH.mm.ss"
    Name
    File Name = "<date> <name>"
    If Synced does not contain File Name
        Set Name of photo → File Name
        Save File → iPhone Favorites (overwrite on)
        Synced = Synced + newline + File Name
        Set Name of Synced → "synced.txt"
        Save File → iPhone Favorites (overwrite on)
    End If
End Repeat
```

The list is saved after every photo, so if the shortcut is stopped partway through, the next run
continues where it left off.

## 3. First run

Run it by tapping it in Shortcuts, with the phone unlocked and on Wi‑Fi. Allow access to Photos
and Google Drive when asked. If you have hundreds of favorites, plug the phone in and keep Shortcuts
open. If it stops or times out, just run it again: it skips everything already saved.

Check that the photos appear in Drive with names like `2026-10-31 12.07.33 IMG_1234.heic`, plus
`synced.txt`.

## 4. Make it run automatically

In Shortcuts, tap **Automation** → **+** (or **New Automation**):

- **App** → choose **Photos** → **Is Closed** → **Run Immediately** → pick **Favorites to Drive**.
  Now it syncs every time you leave the Photos app after hearting something.
- Optional: a second automation, **Time of Day** (for example 9 PM, Daily) → **Run Immediately** →
  the same shortcut, as a backstop.

Turn off **Notify When Run** if the banner bothers you.

## Good to know

- Automations run only while the phone is unlocked. That's an iOS limit for every shortcut.
- **Un-favoriting doesn't delete** anything from Drive.
- To re-copy everything, delete `synced.txt` from the Drive folder. Files with the same names are
  overwritten, not duplicated.
- Don't rename photos in the Drive folder. Moving them is fine as long as you keep `synced.txt` in
  **iPhone Favorites**.
- Photos are saved in whatever format the Photos app hands Shortcuts (usually HEIC or JPEG, with
  edits applied). Live Photos are saved as the still.
- If a step says it can't find the folder, make sure the Google Drive app is signed in and has
  opened at least once. Then re-pick the folder in steps 1, 13 and 16.
