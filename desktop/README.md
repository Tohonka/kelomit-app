# Kelomit desktop companion (macOS)

A live mirror of the phone with editing, over the LAN. The Electron main
process runs the same code as `server/` (ingest, media store, queries), so the
phone pushes to it exactly as it pushes to the remote server. Edits are
commands sent back to the phone, which stays the only writer. Plan and
decisions: `plans_etc/PLAN-20260922-desktop-companion.md`.

## Run

```bash
cd desktop && npm install     # rebuilds better-sqlite3 against Electron's Node
npm run dev                   # electron-vite dev with hot reload
npm run package               # unsigned .app in dist/mac-arm64/ (drag to /Applications)
npm run typecheck && npm test
```

Node 22 (`/opt/homebrew/opt/node@22/bin`) — better-sqlite3 has no prebuilt for
Node 26 and `npm install` compiles it. The app itself uses Electron's Node.

## Pairing

**Pair phone…** (⌘⇧P) shows a QR encoding `kelomit://pair?url=…&token=…`.
On the phone: Settings → Data → Companion → *Scan pairing QR*. The phone then
pushes its whole database + media once, and after every change (1.5 s debounce;
GPS-type tables every 30 s), and keeps a WebSocket open for commands.

The Mac and the phone must be on the same network; the token is the guard
(plain http on the LAN). If the Mac's IP changes, pair again.

## Data

`~/Library/Application Support/Kelomit Companion/` (Help → Open Data Folder):

| File | What |
|---|---|
| `current.db` | the phone's last push (never written here) |
| `snapshots/` | last 30 pushes |
| `media/` | photos, voice, video by basename |
| `token` | pairing secret, generated once |
| `queue.json` | commands waiting for the phone + refused ones |

## Editing model

Every edit is a command (`entries.update`, `days.update`, `projects.rename`, …)
appended to `queue.json`. The queue drains in order while the phone is connected
and waits while it is not; the header shows *N waiting* / *N failed*. A pending
create is edited or discarded *in the queue* (no temporary ids). The phone applies
commands through its own store actions and re-pushes the database, which is what
finally updates the view. Arrival order wins on conflicts.

## Dev aids

| Env | Effect |
|---|---|
| `KELOMIT_DATE=2026-09-16` | open on that day |
| `KELOMIT_VIEW=map` | open on a view (`day`, `projects`, `leave`, `map`) |
| `KELOMIT_SCREENSHOT=/tmp/x.png` | capture the window after load and quit |
| `KELOMIT_REPORT_PDF=/tmp/r.pdf` | print 1–16 Sep 2026's report headlessly and quit |

To develop against real data, copy a backup's `kelomit.db` to `current.db` and
its `media/*` into `media/`.

## Menu

File: New Note ⌘N · Export Work Report… ⌘E. View: Day ⌘1 · Map ⌘M · Projects &
Tags ⌘2 · Leave ⌘3. Go: Today ⌘T · Previous/Next Day ⌘[ ⌘].
