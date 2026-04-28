# ClickUp Daily Update — Chrome Extension

Generate a ClickUp-formatted daily standup from your time entries. Pick a date and a folder, copy, paste into ClickUp Chat.

The Folders dropdown is **projected from your time entries** for the selected day — only folders where you logged time appear. No time logged → empty dropdown.

The pasted format auto-renders into ClickUp Chat task cards with status badges (DELIVERED, IN PROGRESS, etc.) followed by the worked time.

## Install (end users)

1. Go to the latest [release](https://github.com/arslan8122/clickup-mcp/releases) and download `clickup-daily-update-extension-X.Y.Z.zip`.
2. Unzip the archive.
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the unzipped folder.
6. Pin the extension to your toolbar (puzzle-piece icon → pin "ClickUp Daily Update").
7. Right-click the icon → **Options**.
8. Paste your ClickUp **Personal API Token** (ClickUp → Avatar → Settings → Apps → Generate). The workspace is auto-detected from the token; pick one if you have multiple.
9. Click **Save**.

That's it. Click the icon to open the popup.

## Use

1. Click the extension icon. Date defaults to today.
2. The **Folder** dropdown shows only folders where you logged time on the selected day.
3. Pick a folder → tasks appear with status + worked time. Uncheck any task you don't want in the report.
4. Fill in **Planned for Tomorrow** (one bullet per line), **AI Usage**, **Blockers** (defaults to "None at the moment.").
5. Click **Copy**. Paste into ClickUp Chat — each task URL auto-renders into a card with the pink status badge.

## How "worked time" is computed

`Xh Ym` after the status is the **sum of your own time entries** on that task during the selected local day. Multiple entries on the same task are summed. Other assignees' time on the same task is excluded.

## Build from source

```bash
git clone https://github.com/arslan8122/clickup-mcp.git
cd clickup-mcp
npm install
npm run build:extension
```

Then load the `extension/` folder via `chrome://extensions` → Load unpacked.

## Privacy & security

- Your token is stored in `chrome.storage.local`, which is unencrypted on disk. Don't install on a shared machine.
- The extension only talks to `api.clickup.com` (declared in `manifest.json` as the sole host permission).
- No telemetry. No third-party services. The source is in this repo.

## Cutting a release (maintainers)

1. Bump `version` in `extension/manifest.json` (e.g. `0.1.0` → `0.2.0`).
2. Commit: `git commit -am "extension: v0.2.0"`.
3. Tag with the `ext-v` prefix: `git tag ext-v0.2.0 && git push --tags`.
4. The `Release Chrome extension` workflow builds, zips, and attaches the archive to a new GitHub Release automatically.

To package locally without releasing:

```bash
npm run package:extension
# → release/clickup-daily-update-extension-<version>.zip
```
