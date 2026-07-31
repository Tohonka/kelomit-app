# Kelomit — Project Overview

**What it is:** A personal Android app for tracking workdays and personal time.
The owner (Tommi, tommi@pico.fi) has severe ADHD + ASD (both diagnosed) and needs
a fast, frictionless way to capture what happened during the day — notes, photos,
voice memos, videos — and to track hours worked vs. time spent on personal things.

Single-user by design. There is no multi-user story, no auth beyond a shared
token, and privacy scope is deliberately deferred until someone else onboards.

> Companion docs: [ARCHITECTURE.md](ARCHITECTURE.md) for code patterns and schema,
> [hours-model.md](hours-model.md) for how hours are actually calculated.
> `plans_etc/` (git-ignored) holds per-iteration design + implementation plans.

---

## Core concept

The day is the primary unit. Each calendar day is a "Day object" that collects:
- Up to two manual work legs (start/end, plus a second start/end for split days)
- Any number of Entries (notes, photos, voice recordings, videos)
- A background GPS trail, derived into route stops and segments
- Hour tracking via entry timestamps, explicit duration, or from–to ranges

### Activity types (on every entry)
| Type | Meaning |
|---|---|
| `work` | Default. Counts toward hours worked. |
| `personal_work` | Personal task done during work time. Excluded from work hours. |
| `personal` | Fully personal, ignored in all calculations. More like a journal. |

Entries can additionally be flagged `is_overtime`, and can be to-dos
(`is_todo` + `scheduled_date` + `completed_at` + `reminder_at`).

---

## What is built

*Current as of 2026-07-31, app version 0.3.84, schema v23.*

### Shell and navigation
- "Liquid glass" nav shell: a translucent top feature bar plus a floating bottom
  pill, not a stock tab bar (`src/navigation/NavShell.tsx`, `TopFeatureBar.tsx`,
  `BottomPill.tsx`). A center quick-add button sits in the pill.
- Screens: Home, Calendar, Day, Map tab, Day map, Gallery, Search, Insights,
  Tags, Projects, Settings, plus Add-entry and Quick-add modals.
- Settings is split into sub-screens under `src/screens/settings/`: Interface,
  Location, Tracking, Work details, Reporting, Quick-add, Transcription, Tags &
  projects, Widget, Data, Diagnostics.

### Capture
- Note, photo, video, voice entries; camera or gallery import.
- Quick-add modal for the fast path; full Add-entry modal for everything else.
- Title, body, project, tags, activity type, overtime flag, to-do fields.
- Time tracking per entry: none, duration, or from–to. **Every entry resolves to
  a real from→to internally** — see `hours-model.md`.
- Voice notes transcribe to text. Two engines: OpenAI Whisper API, or on-device
  `whisper.rn` with a downloaded ggml model. Picked in Transcription settings.

### Day, calendar, insights
- Day screen: editable work legs, hour breakdown, filterable entry list.
- Calendar: month / week / custom range, hours per day, linked leave ranges.
- Insights screen with charts over the tracked data.
- Pay periods (`src/utils/payPeriod.ts`) — a contiguous period starting on day X
  and ending on X−1 the following month. Reports default to it.

### Hours, leave and payroll reporting
- `leave_ranges` table: date-range leave records typed
  `paid_day_off` / `unpaid_day_off` / `vacation` / `sick`.
- Report classification splits hours into **regular / remote-other / overtime**,
  in one shared pure builder (`src/services/workReport.ts`) so the phone and the
  server produce byte-identical numbers.
- Three report types: `hours`, `headlines`, `statistics`.
- PDF export on device via a native Kotlin renderer
  (`android/.../reporting/WorkReportRenderer.kt`, Canvas + `PdfDocument`), and on
  the server via Chromium/Puppeteer against an HTML twin of the same layout.

### GPS, routes and places
- Background tracking in a Kotlin foreground service (`LocationService.kt`) with a
  fast/slow power ladder, Activity Recognition transitions, and geofence-based
  place monitoring.
- Raw evidence stays in `gps_track` + `activity_events` (45-day retention);
  stops and segments are *derived* into `day_route_stops` / `day_route_segments`
  and are rerunnable.
- Named places, place cache, visited-locations list, map screen with trip details.
- Automatic workday start/end detection with a confirmation prompt.
- On-device diagnostics log (`diag_log` + Diagnostics settings) for debugging
  tracking behaviour over days.

### Sync and web view
- One-way whole-DB push to a Hetzner-hosted server (`kelmi.pico.fi`).
- `server/` is a Hono + better-sqlite3 app served behind Caddy in Docker. It is a
  **browser version of the app**, not a read-only dump, and it imports the app's
  own `src/services/workReport.ts` and `hoursUtils` so the shared logic cannot
  drift.
- `/report.pdf` generates the work-hours PDF server-side.

### Other
- CSV export, backup/restore (zip), home-screen session widget, notifications,
  Finnish + English UI (i18next).

---

## UI / Design language

- **"Liquid glass" synthwave palette**, dark-first (redesign July 2026). Dark bg
  `#090D16`, pink primary `#D0268C`. The old warm terracotta theme is **gone**.
- Activity hues: work → pink, personal-at-work → amber, personal → cyan.
- Glass surfaces are faked with translucent fills — no blur library on Android.
- System font throughout.
- `makeStyles(c: Colors)` + `useMemo` everywhere — see ARCHITECTURE.md.

---

## Future / not yet built

- **Two-way sync** — the push is currently one-way, phone → server. Editing days
  in the browser and having it flow back is the intent but is not built.
- **Report templates** — see the sidequest note in `plans_etc/`; the goal is one
  HTML template per report type shared by phone and server, replacing the
  hand-drawn Kotlin Canvas renderer.
- **Photo/video interpretation via LLM** — describe content, extract text. Only
  voice transcription exists today.
- **Action sounds + haptics** — haptics fire on quick-add only; there is no sound
  system and no on/off toggle. This is the one genuinely half-finished thread.
- **iOS** — the RN choice keeps it possible; nothing has been done.

---

## Build / run

```bash
npm install

# Android dev (device or emulator)
npx react-native run-android

# TypeScript check (app + server)
npx tsc --noEmit

# Tests
npx jest

# Release APK (sideload)
cd android && ./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk

# Version bump — package.json is the source of truth, syncs gradle + src/version.ts + tag
npm version patch
```

Server lives in `server/` with its own `package.json`, `Dockerfile` and
`compose.yaml`; see `server/README.md`.

---

## Known issues / quirks

- **Sideloading:** any permission or component change breaks an in-place update on
  Android. Uninstall → reinstall, and back up the DB first.
- **`android.permission.VIBRATE`** is required in AndroidManifest.xml (already
  there). Without it the app crashes on entry save.
- **Entry `entry_type` cannot be changed** after creation — `updateEntry` in
  `src/db/entries.ts` intentionally omits it; the edit modal disables the selector.
- **`realUserData/`** holds real device DB backups for debugging. Never commit
  coordinates from it.
- Native tracking changes are compile-verified only until a real walk/drive
  confirms them; GPS bugs have repeatedly turned out to be revoked Android
  permissions rather than code.
