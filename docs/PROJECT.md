# Kelomit — Project Overview

**What it is:** A personal Android app for tracking workdays and personal time.
The owner (Tommi, tommi@pico.fi) has severe ADHD + ASD (both diagnosed) and needs
a fast, frictionless way to capture what happened during the day — notes, photos,
voice memos, videos — and to track hours worked vs. time spent on personal things.

---

## Core concept

The day is the primary unit. Each calendar day is a "Day object" that collects:
- A manual start / end time for the workday
- Any number of Entries (notes, photos, voice recordings, videos)
- GPS track data (background, passive)
- Hour-tracking via entry timestamps or explicit duration/range fields

### Activity types (on every entry)
| Type | Meaning |
|---|---|
| `work` | Default. Counts toward hours worked. |
| `personal_work` | Personal task done during work time. Excluded from work hours. |
| `personal` | Fully personal, ignored in all calculations. More like a journal. |

---

## What is built (MVP, as of June 2026)

### Navigation
- Bottom tab bar: **Home**, **Calendar**, **Settings**
  - Icons: MaterialCommunityIcons (`home-variant`, `calendar-month`, `cog`)
- Stack screens over tabs: **DayScreen**, **AddEntryModal**, **EntryDetailScreen**, **ProjectsScreen**

### Home screen
- Shows today's date with a greeting
- Quick-add FAB opens AddEntryModal for today
- Tapping a date navigates to DayScreen

### Day screen
- DaySummaryCard: editable start/end time pickers + work-hours total
- Hour breakdown bar (work / personal-work / personal segments with legend)
- Filterable entry list (project + tag chips)
- FAB to add entry to this day

### Calendar screen
- Three views: Month grid, Week strip, Custom range
- Each day cell shows tracked work hours
- Tap any day → DayScreen for that date
- Custom range: date pickers, list view with per-day hours

### Add / Edit entry modal
- Entry types: Note, Photo, Video, Voice
- Activity type selector (Work / Personal (work) / Personal)
- Title + body text fields
- Project selector (horizontal scroll chips)
- Tag input with autocomplete and selected-tag chips (removable)
- Time tracking: None / Duration (minutes) / From–To (time pickers)
- Media capture: camera, gallery picker, voice recorder
- **Edit mode**: opened with an `entryId` param; pre-fills all fields; type selector disabled (type cannot change after creation); calls `updateEntry`

### Entry detail screen
- Shows all entry data (type, activity badge, project, tags, media, timestamps)
- **Edit button** → opens AddEntryModal in edit mode
- Delete with confirmation

### Settings screen
- **Theme**: Auto (system) / Light / Dark — segment control, persisted to DB
- GPS tracking: on/off toggle; restarting tracking on toggle-on
- Default activity type (display only for now)
- Projects → ProjectsScreen
- Export CSV: date range pickers + Share sheet

### Projects screen
- Create / archive / restore projects
- Types: work, personal, other
- Color dot per type on chips throughout the app

### GPS tracking
- Background polling via `react-native-geolocation-service` (Google Fused Location)
- Points stored in `gps_track` table per day
- Outlier rejection + Kalman-filter smoothing in `locationUtils.ts`
- Configurable interval (default 60 s), on/off toggle in Settings

### Export
- CSV of all entries in a date range (via `exportUtils.ts` + Share sheet)

---

## UI / Design language

- **Warm, retro-friendly palette**: terracotta primary (`#C85C2D`), cream backgrounds
- **Dark mode**: soft dark theme (`#1A1410` bg), same warm hue family — not cold/blue
- System font throughout (no custom font loaded)
- `makeStyles(c: Colors)` factory + `useMemo` pattern everywhere — styles recalculate only when theme changes
- Theme stored in `settings` table as `theme_mode` key: `'system' | 'light' | 'dark'`

---

## Future / not yet built

These are confirmed plans or strong ideas, roughly in priority order:

### Sync / server
- Hetzner CCX23 (16 GB RAM), running Docker, dedicated container to be set up
- Intent: online sync + browser-based viewing and editing of days
- DB choice (op-sqlite locally) should be compatible with a future sync layer
- No specific sync protocol chosen yet; readiness was a design goal from the start

### LLM integrations
- Transcribe voice recordings (speech-to-text) via configurable LLM service
- Interpret photos / videos (describe content, extract text, etc.)
- User selects which LLM provider/API key

### GPS improvements
- Android Activity Recognition API (`react-native-activity-recognition`) to suppress points during stillness
- Currently just raw Kalman-smoothed track

### More ideas Tommi mentioned
*(Add here as they come up in chat — these will pile up fast)*

---

## Build / run

```bash
# Install deps
yarn

# Android dev (emulator or device)
npx react-native run-android

# TypeScript check
npx tsc --noEmit

# Release APK (sideload)
cd android && ./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
```

---

## Known issues / quirks

- `react-native-audio-recorder-player` must stay at **^4.1.5** + `react-native-nitro-modules@^0.26.3`. Version 4.5.0 references an unpublished nitro version and will fail to build.
- `android.permission.VIBRATE` is required in AndroidManifest.xml (already added). Without it the app crashes silently on entry save.
- Entry `entry_type` **cannot be changed** after creation — `updateEntry` in `db/entries.ts` intentionally omits it; the edit modal disables the type selector accordingly.
