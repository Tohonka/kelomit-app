# Kelomit desktop companion (macOS)

A live mirror of the phone with editing, over the LAN. The Electron main process
runs the same code as `server/` (ingest, media store, queries), so the phone
pushes to it exactly as it pushes to the remote server. Edits are commands sent
back to the phone, which stays the only writer. Plan:
`plans_etc/PLAN-20260922-desktop-companion.md`.

```bash
cd desktop && npm install     # rebuilds better-sqlite3 against Electron's Node
npm run dev                   # electron-vite dev, hot reload
npm run typecheck && npm test
```

Data lives in `~/Library/Application Support/Kelomit Companion/`
(`current.db`, `snapshots/`, `media/`, `token`, `queue.json`). Help → Open Data Folder.

Pairing: **Pair phone…** shows a QR (`kelomit://pair?url=…&token=…`); scan it from
the phone's Settings → Data → Companion card.
