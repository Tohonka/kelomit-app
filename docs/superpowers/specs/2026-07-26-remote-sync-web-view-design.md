# Remote sync + read-only web view — design

Date: 2026-07-26
Status: approved (design), not implemented
Host: `kelmi.pico.fi` → Playground-1 (Hetzner, Ubuntu 24.04, Docker, Caddy)

---

## Goal

Off-site backup of the phone's data, plus a browser page for viewing days, hours,
media and routes. **One-way: the phone is the only writer.** Nothing on the server
is ever edited, and nothing is ever pulled back except for disaster recovery.

Non-goals for this iteration: editing from the browser, two-way sync, multi-user,
video upload, near-live freshness.

## Decisions

| Question | Decision |
|---|---|
| Scope | Backup + read-only web view |
| Media | Photos (`.jpg`) + voice (`.wav`, legacy `.m4a`) upload; video (`.mp4`) stays phone-only |
| Freshness | Daily-ish |
| Mechanism | Whole-DB push (approach A) — no incremental sync protocol |
| Server stack | Node + Hono, `better-sqlite3` for reads |
| Server code location | This repo, `server/` |
| Transport | Public HTTPS via existing Caddy, Cloudflare-proxied DNS |
| Web view auth | Caddy `basic_auth` |
| Upload auth | Bearer token |

### Why whole-DB push

The DB is **~1 MB** after months of real use; media totals ~63 MB (27 photos,
7 voice notes). At daily cadence, pushing the entire database costs nothing.

Because the phone is the sole writer, the SQLite file *is* the state. That deletes
the entire category of work that makes sync expensive: no UUID primary keys, no
`updated_at` maintenance, no tombstone table, no per-table change feed, no delete
detection, no conflict resolution. A deleted entry disappears from the server on
the next push automatically.

The schema has changed 20 times. Any server-side representation of it (approach C's
Postgres ingest) would need updating on every one of those. Reading the phone's own
file has no such coupling.

What this gives up: the server can never be a source of truth. Accepted — going
two-way later costs the same UUID/tombstone migration whenever it is paid, so
choosing A now does not raise that price.

## Architecture

```
Android app                          Playground-1
-----------                          ------------
syncService.ts                       Caddy (existing, picofi project)
  VACUUM INTO snapshot                 kelmi.pico.fi -> 172.17.0.1:8090
  GET  /api/media/manifest                 |
  POST /api/media/:filename                v
  POST /api/sync                       kelomit-web (new compose project)
                                         Hono server
                                         better-sqlite3 (read-only)
                                         /data/current.db
                                         /data/snapshots/*.db
                                         /data/media/*
```

Server code lives in `server/` **inside this repo**, and the Docker build context is
the repo root, so the server imports the app's own pure modules rather than
reimplementing them:

- `src/utils/hoursUtils.ts` — depends only on `date-fns` and `src/types`
- `src/utils/routeSegments.ts`, `src/utils/routeStats.ts`

Hours shown on the web are therefore computed by the same code as on the phone.
This is the main reason for choosing Node over Python or Go.

Trade-off accepted: server deploys are tied to app commits.

## Snapshotting a live database

`backupService.exportBackup()` calls `closeDB()` and `stopTracking()` before copying
the file. That is unacceptable for background sync — it would interrupt GPS tracking.

Instead:

```sql
VACUUM INTO '<cache>/kelomit-sync.db'
```

One statement, produces a consistent snapshot of a live WAL database with no close
and no tracking interruption. The temp file is deleted after upload, success or not.

## Protocol

All endpoints require `Authorization: Bearer <token>`; anything else gets 401.

### `GET /api/media/manifest`

```json
{ "files": ["1719_abc.jpg", "1719_abc.m4a"] }
```

Filenames the server already holds. The app uploads the set difference.

### `POST /api/media/:filename`

Raw body, one file per request. The app sends only `.jpg`/`.wav`/`.m4a` (and thumbnails);
`.mp4` is filtered client-side.

`:filename` is validated server-side against `^[A-Za-z0-9._-]+$` and rejected if it
contains a path separator or `..`. Unknown extensions are rejected.

Cloudflare's proxy caps request bodies at 100 MB; photos are ~2 MB, so one file per
request stays far inside the limit.

### `POST /api/sync`

Raw body = the vacuumed DB. The server:

1. writes it to `/data/incoming.db`
2. opens it read-only and asserts `SELECT MAX(version) FROM schema_version` succeeds
   (rejects a truncated or corrupt upload with 400)
3. copies it to `/data/snapshots/kelomit-YYYYMMDD-HHMM.db`
4. `rename()`s it onto `/data/current.db` — atomic, so a reader never sees a partial file
5. prunes snapshots beyond the newest 30

**Ordering: media first, DB last.** The DB then never references a file the server
lacks.

## Web view

Server opens `current.db` read-only. `better-sqlite3` handles are reopened when the
file's mtime changes, so a sync is picked up without a restart.

Pages:

- **Day list** — recent days with worked hours
- **Day detail** — entries with times, activity type, project, tags; hours breakdown;
  photos inline; voice notes with an `<audio>` player and transcript if present
- **Period summary** — worked hours over a chosen range
- **Day map** — route segments and stops, with place names

Server-rendered HTML. No client framework, no build step for the pages beyond
bundling the TypeScript server.

Auth is a Caddy `basic_auth` block, exactly as `raportti.pico.fi` already does it.
No session handling, no login page, no password storage in app code.

## App side

New `src/services/syncService.ts`:

1. Read `sync_url` and `sync_token` from settings; abort silently if either is empty.
2. `VACUUM INTO` a temp snapshot.
3. `GET /api/media/manifest`.
4. Diff against the local media directory (`<Documents>/kelomit/media`), skipping
   `.mp4`. Upload each missing file sequentially.
5. `POST /api/sync` with the snapshot.
6. Record `sync_last_at` / `sync_last_error`. Delete the temp snapshot.

Triggers:

- Manual **Sync now** button in Settings
- Automatic on app foreground when >6 h since the last success

**No wifi gating.** Detecting the connection type would require adding
`@react-native-community/netinfo` — a new native dependency, and therefore a native
rebuild plus an uninstall→reinstall on the device — to guard one condition. After the
one-time ~63 MB media catch-up (run manually while on wifi), steady-state traffic is
1–3 MB per day. Not worth a native dep. This keeps the whole feature pure JS, so it
installs over the current build.

Sync never blocks the UI, never interrupts tracking, and never surfaces a modal on
failure — only the status line in Settings changes. A partially completed media
upload is fine: the next run re-diffs and continues.

Settings screen gains: server URL, token, last sync time, last error, Sync now.

## Schema

Migration **v21**, settings keys only — no table changes:

```
sync_url, sync_token, sync_last_at, sync_last_error
```

## Deployment

- New compose project at `/home/tommi/kelomit/` on the server, one service, published
  on host port **8090** (free; 8081 is kellari, 2283 immich).
- Bind mount `/home/tommi/kelomit/data` → `/data`.
- Append to `/home/tommi/picofi/Caddyfile`:

```
kelmi.pico.fi {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }
    basic_auth {
        tommi <bcrypt-hash>
    }
    reverse_proxy 172.17.0.1:8090
}
```

The `basic_auth` block must not cover `/api/*` — the app authenticates with a bearer
token, not basic auth. Scope it with a matcher so only the browser-facing routes are
challenged.

No changes to the picofi compose project itself.

## Error handling

| Failure | Behaviour |
|---|---|
| No URL/token configured | Sync is a no-op, no error shown |
| Network unreachable | Recorded in `sync_last_error`, retried on next trigger |
| 401 | Recorded verbatim so a wrong token is obvious in Settings |
| Upload interrupted mid-media | Next run re-diffs and resumes; nothing is corrupted |
| Corrupt DB upload | Rejected with 400 before `current.db` is touched |
| `VACUUM INTO` fails (disk full) | Sync aborts, temp file cleaned up, error recorded |

## Testing

- `syncService`: manifest diff excludes `.mp4` and already-present files; media are
  uploaded before the DB; missing token aborts without a request; a failed media
  upload does not prevent the next run from resuming. Mocked `fetch`.
- Server: given a fixture DB, rendered day hours equal `hoursUtils` output for the
  same day — the shared-code guarantee, asserted rather than assumed.
- Server: `POST /api/sync` with a truncated body leaves `current.db` untouched.
- Server: `POST /api/media/../../etc/passwd` is rejected.

## Explicitly skipped

- Delete propagation — inherent to full-DB push
- Video upload
- Any pull/restore direction beyond copying a snapshot off by hand
- Request compression — 1 MB does not need it
- Styled login, sessions, multi-user
- Postgres, ORM, migrations on the server side
- Wifi-only gating (would cost a native dependency — see App side)

## Unrelated hygiene note

`envCreds/server-playground1.env` contains the server password in plaintext and is
committed to git (`7c0cb0c`) on a repo that has an `origin` remote. Rotate the
password and gitignore that directory. Not part of this work, but it should not
survive it.
