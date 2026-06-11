# Kelomit App — Implementation Plan

> Implementation guide for Claude Code. Follow phases in order. Each phase should be fully working and testable before starting the next.

---

## 1. Project Overview

A personal Android journal and hour-tracking app. The user logs their day using text notes, photos, videos, and voice recordings. The app tracks time spent on work vs personal activities. ADHD/ASD-friendly design: fast to use, low friction, forgiving.

**Target platform**: Android (React Native, bare workflow — no Expo managed runtime)  
**Language**: TypeScript throughout  
**Minimum Android SDK**: 26 (Android 8.0)

---

## 2. Tech Stack

| Concern | Library | Reason |
|---|---|---|
| Framework | `react-native` (bare CLI) | Full native module access |
| Navigation | `@react-navigation/native` + `bottom-tabs` + `native-stack` | Standard, well-supported |
| Database | `@op-engineering/op-sqlite` | Fastest RN SQLite, supports WAL mode |
| State | `zustand` | Minimal boilerplate, easy to reason about |
| Date utils | `date-fns` | Lightweight, tree-shakable |
| Camera/Gallery | `react-native-image-picker` | Handles photo + video, gallery + capture |
| Audio | `react-native-audio-recorder-player` | Record + playback in one package |
| GPS | `react-native-geolocation-service` | Uses Google Fused Location Provider |
| Icons | `react-native-vector-icons` (MaterialCommunityIcons) | Wide icon set |
| Styling | StyleSheet + custom theme tokens | No UI framework; retain full visual control |

**Do NOT use Expo managed workflow.** The GPS, camera, and audio requirements need direct native module configuration.

---

## 3. Database Schema

Use a single SQLite file at the app's documents directory. Run migrations on app start using a versioned migration system.

### Table: `days`
One row per calendar day.

```sql
CREATE TABLE days (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT NOT NULL UNIQUE,   -- ISO date: "2026-06-10"
  started_at  TEXT,                   -- ISO datetime, user-set day start
  ended_at    TEXT,                   -- ISO datetime, user-set day end
  notes       TEXT,                   -- optional day-level note
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Table: `entries`
Individual log items within a day.

```sql
CREATE TABLE entries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id          INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  entry_type      TEXT NOT NULL CHECK(entry_type IN ('note','photo','video','voice')),
  activity_type   TEXT NOT NULL DEFAULT 'work'
                    CHECK(activity_type IN ('work','personal_work','personal')),
  title           TEXT,
  body            TEXT,                  -- text note content
  project_id      INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  file_path       TEXT,                  -- local file path for media
  thumbnail_path  TEXT,                  -- for photos/videos
  duration_sec    INTEGER,               -- explicit duration (seconds)
  time_from       TEXT,                  -- ISO datetime
  time_to         TEXT,                  -- ISO datetime
  latitude        REAL,
  longitude       REAL,
  location_label  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Table: `gps_track`
Raw GPS points for the day's location trail.

```sql
CREATE TABLE gps_track (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id      INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  latitude    REAL NOT NULL,
  longitude   REAL NOT NULL,
  accuracy    REAL,
  altitude    REAL,
  speed       REAL,
  timestamp   TEXT NOT NULL
);
```

### Table: `projects`
User-defined projects. Entries can optionally belong to one project.

```sql
CREATE TABLE projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL DEFAULT 'work'
                CHECK(type IN ('work','personal','other')),
  archived    INTEGER NOT NULL DEFAULT 0,  -- 0 = active, 1 = archived
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Table: `tags`
Free-form tags for search and organisation. Tags are shared across all entries.

```sql
CREATE TABLE tags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Table: `entry_tags`
Many-to-many join between entries and tags.

```sql
CREATE TABLE entry_tags (
  entry_id  INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);
```

### Table: `settings`
Key-value store for user preferences.

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

### Default settings to seed on first launch:
```
gps_enabled = "true"
gps_interval_ms = "60000"
default_activity_type = "work"
default_project_id = ""
```

### Hours Calculation Logic
- **Work hours** = sum of `(time_to - time_from)` or `duration_sec` for entries where `activity_type = 'work'`
- **Personal during work** = excluded from work total but shown separately
- **Personal** = ignored from all time math
- If `started_at` and `ended_at` exist on a `days` row, total day length can be derived from those. Work hours are still entry-based.

---

## 4. Activity Types

| Value | Label | Meaning |
|---|---|---|
| `work` | Work | Counts toward work hours (default) |
| `personal_work` | Personal (during work) | Happened during work time, not counted |
| `personal` | Personal | Pure personal, fully excluded |

Display with a colored badge on each entry.

---

## 5. Navigation Structure

```
RootStack (native-stack)
├── MainTabs (bottom-tabs)
│   ├── HomeTab → HomeScreen
│   ├── CalendarTab → CalendarScreen
│   └── SettingsTab → SettingsScreen
├── DayScreen (pushed from CalendarScreen or HomeScreen)
├── EntryDetailScreen (pushed from any entry list)
└── AddEntryModal (modal, presented from FAB anywhere)
```

**Bottom tab bar**: Home, Calendar, Settings. Keep it minimal.  
**FAB**: Floating action button visible on HomeScreen and DayScreen. Opens AddEntryModal.

---

## 6. Screen Specifications

### HomeScreen
- Shows today's date prominently
- `DaySummaryCard`: day start/end times (tappable to edit), work hours total today
- `EntryList`: scrollable list of today's entries, most recent first
- `QuickAddFAB`: opens AddEntryModal

### CalendarScreen
- Toggle between Month / Week / Day views (segmented control at top)
- **Month view**: grid of days, each cell shows the day number + work hours (e.g. "6.5h"). Tap a day → pushes DayScreen.
- **Week view**: 7 columns, each showing entry count and work hours. Tap a day → pushes DayScreen.
- **Day view** (in calendar): same as DayScreen but within the calendar context.
- Show total hours for visible period in a summary bar.

### DayScreen
- Header: date, edit pencil icon
- `DayHeaderCard`: editable `started_at` / `ended_at`, work hours total, activity breakdown
- `EntryList`: all entries for that day, grouped by activity type or chronological (user preference in settings)
- FAB: add new entry

### AddEntryModal (bottom sheet or full modal)
- Step 1: Choose type — Note | Photo | Video | Voice (4 large tap targets)
- Step 2: Activity type selector (Work / Personal during work / Personal) — Work pre-selected
- Step 3: Type-specific capture (camera, recorder, etc.)
- Step 4: Metadata — title (optional), text body (optional), time tracking (optional: duration OR from/to)
  - **Project selector** (optional): dropdown/search of existing projects + "New project…" option. Selecting "New project…" opens a small inline form (name + type). Default: none.
  - **Tag input** (optional): tag chips input. User types a tag name; autocomplete suggests existing tags. Press space/comma/enter to confirm. Tags are created automatically if new. No limit on count.
- GPS is tagged automatically if enabled
- Save button always visible, never buried

### EntryDetailScreen
- Full view of a single entry
- Shows media (image/video player/audio player)
- Shows metadata: title, body, time info, activity type, location
- Edit button → inline editing (same fields as AddEntryModal step 4)
- Delete button (confirm dialog)

### SettingsScreen
- GPS tracking toggle + interval selector
- Default activity type
- Export data (CSV)
- App version

---

## 7. Component Library (build these reusable components)

```
components/
├── ui/
│   ├── Button.tsx          -- primary, secondary, ghost variants
│   ├── Card.tsx            -- base card container with shadow
│   ├── Badge.tsx           -- activity type badge (color-coded)
│   ├── BottomSheet.tsx     -- reusable bottom sheet wrapper
│   ├── TimePicker.tsx      -- native time input wrapped nicely
│   ├── DatePicker.tsx      -- native date input wrapped
│   ├── SegmentedControl.tsx
│   └── FAB.tsx
├── entries/
│   ├── EntryListItem.tsx   -- single row: icon, title, time, badge, thumbnail, project chip, tag chips
│   ├── EntryList.tsx       -- FlatList wrapper
│   ├── EntryTypeIcon.tsx   -- icon by entry_type
│   ├── ActivityBadge.tsx   -- colored chip: Work / Personal work / Personal
│   ├── ProjectChip.tsx     -- project name + type color dot
│   └── TagChip.tsx         -- single tag pill
├── day/
│   ├── DaySummaryCard.tsx  -- hours worked, start/end times
│   ├── DayHeader.tsx       -- date display + edit
│   └── HourBreakdown.tsx   -- visual bar: work vs personal_work vs personal
├── calendar/
│   ├── MonthGrid.tsx
│   ├── WeekRow.tsx
│   └── DayCell.tsx
└── media/
    ├── PhotoCapture.tsx
    ├── VideoCapture.tsx
    ├── VoiceRecorder.tsx
    ├── MediaThumbnail.tsx
    └── AudioPlayer.tsx
```

---

## 8. Data Layer

Create a `db/` directory:

```
db/
├── database.ts       -- open DB, run migrations on init
├── migrations.ts     -- versioned SQL migrations array
├── days.ts           -- CRUD for days table
├── entries.ts        -- CRUD for entries table (always JOIN tags + project when fetching)
├── projects.ts       -- CRUD for projects table
├── tags.ts           -- CRUD for tags + entry_tags join table
├── gps.ts            -- insert/query gps_track
└── settings.ts       -- get/set settings
```

**Note on fetching entries**: every `getEntry` / `getEntriesForDay` query should also fetch associated tags (via `entry_tags` JOIN) and the project name/type. Return these on the `Entry` object as `tags: Tag[]` and `project: Project | null`. Avoid N+1 queries — use a single JOIN or batch tags in one extra query.

All DB functions should be `async` and return typed objects. Define TypeScript interfaces in `types/index.ts`.

### Key types:

```typescript
type ActivityType = 'work' | 'personal_work' | 'personal';
type EntryType = 'note' | 'photo' | 'video' | 'voice';
type ProjectType = 'work' | 'personal' | 'other';

interface Project {
  id: number;
  name: string;
  type: ProjectType;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

interface Tag {
  id: number;
  name: string;
  created_at: string;
}

interface Day {
  id: number;
  date: string;           // "YYYY-MM-DD"
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface Entry {
  id: number;
  day_id: number;
  entry_type: EntryType;
  activity_type: ActivityType;
  project_id: number | null;
  title: string | null;
  body: string | null;
  file_path: string | null;
  thumbnail_path: string | null;
  duration_sec: number | null;
  time_from: string | null;
  time_to: string | null;
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields (not stored in entries table):
  tags?: Tag[];
  project?: Project | null;
}

interface GpsPoint {
  day_id: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  timestamp: string;
}
```

---

## 9. State Management (Zustand)

```
store/
├── dayStore.ts       -- current day, list of days
├── entryStore.ts     -- entries for current/selected day
├── projectStore.ts   -- list of projects (loaded once, cached)
├── tagStore.ts       -- all known tags (for autocomplete suggestions)
└── settingsStore.ts  -- user settings
```

Stores should:
1. Load from SQLite on first access
2. Write to SQLite on every mutation (optimistic UI)
3. Expose simple actions: `addEntry`, `updateEntry`, `deleteEntry`, `setDay`, etc.

---

## 10. GPS Service

```
services/
├── gpsService.ts     -- start/stop tracking, handle updates
└── locationUtils.ts  -- outlier rejection, distance calc
```

**GPS strategy**:
- Use `react-native-geolocation-service` with `enableHighAccuracy: true`
- Start tracking when app is foregrounded and `gps_enabled = true`
- Record a point every N seconds (configurable, default 60s)
- **Outlier rejection**: if new point is >500m from last point in <30s, discard it
- Tag each new entry with the most recent valid GPS point
- Use reverse geocoding (device offline-capable if possible, otherwise skip label) — optional for MVP

**Android permissions needed**: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`

---

## 11. Media Handling

**Storage**: all media files saved to `DocumentDirectoryPath + '/kelomit/media/'`

**Photos**: save original + generate 200×200 thumbnail  
**Videos**: save original + extract first-frame thumbnail  
**Voice**: save as `.m4a` (AAC)

File naming: `{entry_type}_{timestamp}_{uuid}.{ext}`

Permissions needed:
- `CAMERA`
- `RECORD_AUDIO`
- `READ_EXTERNAL_STORAGE` / `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO` (Android 13+)

---

## 12. Visual Design System

### Color Tokens (warm + retro)

```typescript
export const colors = {
  // Backgrounds
  bg:           '#FDF6EE',  // warm cream
  bgCard:       '#FFF8F0',  // slightly lighter
  bgMuted:      '#F0E6D6',  // muted warm

  // Primary
  primary:      '#C85C2D',  // terracotta
  primaryLight: '#E8845C',
  primaryDark:  '#9E3E1A',

  // Accents
  accent:       '#D4A057',  // warm amber
  accentLight:  '#ECC07A',

  // Text
  textPrimary:  '#3D2B1F',  // dark warm brown
  textSecondary:'#7A5C48',
  textMuted:    '#A08070',

  // Activity type badges
  badgeWork:          '#4A7C59',  // muted green
  badgePersonalWork:  '#B07030',  // warm orange
  badgePersonal:      '#7A6B8A',  // muted purple

  // System
  error:        '#B03030',
  success:      '#4A7C59',
  border:       '#DDD0C0',
  shadow:       '#3D2B1F',
};
```

### Typography

```typescript
export const typography = {
  fontFamily: 'System',       // use system font; add custom font in Phase 5
  sizes: {
    xs: 11, sm: 13, base: 15, md: 17, lg: 20, xl: 24, xxl: 32,
  },
  weights: {
    regular: '400', medium: '500', semibold: '600', bold: '700',
  },
};
```

### Spacing / Radius

```typescript
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius  = { sm: 6, md: 10, lg: 16, xl: 24, pill: 100 };
```

### Design principles
- Large tap targets (min 48dp)
- Important actions always reachable with one thumb (bottom-of-screen FAB)
- Minimal required fields — everything optional except the entry type
- Destructive actions require a confirm step
- No modals stacked more than 2 deep

---

## 13. Project File Structure

```
kelomit-app/
├── android/
├── src/
│   ├── components/       (see Section 7)
│   ├── db/               (see Section 8)
│   ├── navigation/
│   │   ├── RootNavigator.tsx
│   │   ├── MainTabs.tsx
│   │   └── navigationTypes.ts
│   ├── screens/
│   │   ├── HomeScreen.tsx
│   │   ├── CalendarScreen.tsx
│   │   ├── DayScreen.tsx
│   │   ├── EntryDetailScreen.tsx
│   │   ├── AddEntryModal.tsx
│   │   ├── SettingsScreen.tsx
│   │   └── ProjectsScreen.tsx      -- list + create + archive projects
│   ├── services/
│   │   ├── gpsService.ts
│   │   └── locationUtils.ts
│   ├── store/            (see Section 9)
│   ├── theme/
│   │   └── index.ts      (colors, typography, spacing, radius)
│   ├── types/
│   │   └── index.ts
│   └── utils/
│       ├── dateUtils.ts   -- format dates, calculate durations
│       ├── hoursUtils.ts  -- compute work hours from entries, breakdowns by project/tag
│       ├── mediaUtils.ts  -- file paths, thumbnail generation
│       └── exportUtils.ts -- CSV export logic (includes project + tag columns)
├── App.tsx
├── CLAUDE.md
├── PLAN.md
└── package.json
```

---

## 14. Build Phases

### Phase 1 — Foundation (start here)
**Goal**: Working app shell with navigation and text notes.

1. Initialize React Native project (`npx react-native init KelomitApp --template react-native-template-typescript`)
2. Install and configure navigation (bottom tabs + native stack)
3. Set up theme tokens (`src/theme/index.ts`)
4. Set up database: install `@op-engineering/op-sqlite`, write migrations, open DB on app start
5. Implement `days`, `entries`, `projects`, `tags`, `entry_tags` CRUD functions
6. Create Zustand stores: `dayStore`, `entryStore`, `projectStore`, `tagStore`
7. Build `HomeScreen`: date header, empty entry list, placeholder FAB
8. Build `AddEntryModal`: note type only, activity type selector, **project selector**, **tag input**, save to DB
9. Wire up `EntryList` and `EntryListItem` to show saved notes with project chip + tag chips
10. Build `DayScreen` (same list, different day context)
11. Build `ProjectsScreen`: list active projects, create new project (name + type), archive
12. Link `ProjectsScreen` from `SettingsScreen` (placeholder settings for now)

**Deliverable**: Can add text notes with optional project and tags, see them in a list, navigate between screens.

---

### Phase 2 — Time Tracking
**Goal**: Full hour tracking functionality.

1. Add `DaySummaryCard` with editable `started_at` / `ended_at` (time picker)
2. Add time tracking fields to `AddEntryModal`: toggle between "duration" and "from → to" modes
3. Implement `hoursUtils.ts`: calculate work hours from entries for a day or range
4. Display work hours total on `HomeScreen` and `DayScreen`
5. Add `HourBreakdown` bar (visual split of work / personal_work / personal)
6. Add activity type badge to `EntryListItem`

**Deliverable**: Full time tracking working. Can see today's work hours.

---

### Phase 3 — Calendar
**Goal**: Navigate days and see time summaries over time.

1. Build `CalendarScreen` with Month view: grid of `DayCell` components
2. Each `DayCell` shows date + work hours for that day (query from DB)
3. Tap a day → navigate to `DayScreen` for that date
4. Add Week view: horizontal week strip + day columns
5. Add segmented control to toggle Month / Week
6. Add hours summary bar at top (total for visible period)
7. "Custom range" can be deferred to Phase 5

**Deliverable**: Can navigate to any past day, see hours at a glance.

---

### Phase 4 — Media
**Goal**: Photos, voice recordings, and video.

1. Set up Android permissions (camera, microphone, storage)
2. Build `PhotoCapture` component using `react-native-image-picker`
3. Implement thumbnail generation and storage
4. Build `AudioPlayer` + `VoiceRecorder` components using `react-native-audio-recorder-player`
5. Build `VideoCapture` component (capture + gallery pick)
6. Wire all media types into `AddEntryModal` steps
7. Show thumbnails in `EntryListItem`
8. Build `EntryDetailScreen`: full media display (image, video player, audio player)
9. Add gallery pick option alongside camera capture

**Deliverable**: Full media capture and viewing.

---

### Phase 5 — GPS + Export + Polish
**Goal**: Location tracking, export, and visual refinements.

1. Set up GPS service: permissions, start/stop on app foreground/background
2. Outlier rejection logic
3. Tag entries with current location on save
4. Show `location_label` on entries if available
5. Implement CSV export: all entries for a date range → share sheet. Columns include: date, time_from, time_to, duration_sec, entry_type, activity_type, project_name, project_type, tags (semicolon-separated), title, body, latitude, longitude
6. Add filter UI to DayScreen / CalendarScreen: filter by project, filter by tag(s)
7. Add custom range selector to CalendarScreen
7. Typography: add a custom warm/retro font (e.g. DM Sans or similar)
8. Animation polish: list item entrance, modal transitions
9. Haptic feedback on key actions (save, delete)

**Deliverable**: Complete MVP. All features working.

---

### Phase 6 — Sync Readiness (future, not MVP)
**Goal**: Prepare for server sync without breaking local-first behavior.

1. Add `sync_status` column to `entries` and `days` (`pending | synced | conflict`)
2. Add `server_id` column to both tables
3. Design a sync queue: local changes are queued and pushed when online
4. Server API spec (REST or WebSocket — TBD based on Hetzner setup)
5. Conflict resolution strategy: last-write-wins for MVP, manual for conflicts
6. Auth: device token-based (no user accounts needed initially)

---

## 15. Permissions Manifest (AndroidManifest.xml)

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
<!-- For Android < 13: -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
  android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
  android:maxSdkVersion="28" />
```

Request permissions at runtime (not just in manifest) using `react-native-permissions` before any feature that needs them.

---

## 16. Key Implementation Notes for Claude Code

- **Always use TypeScript** with strict mode. No `any` types.
- **DB calls are async** — use `async/await`, never `.then()` chains.
- **Zustand stores** should be the single source of truth. Components read from stores, never from DB directly.
- **No class components** — functional components + hooks only.
- **Migrations**: never edit existing migrations. Add a new migration for schema changes.
- **File paths**: always use `react-native-fs` `DocumentDirectoryPath` for media storage. Never hardcode paths.
- **Dates**: always store as ISO 8601 strings in SQLite. Use `date-fns` for all formatting and math.
- **Error handling**: DB errors should be caught and surfaced in UI (don't silently swallow).
- **Testing**: write at minimum unit tests for `hoursUtils.ts` and `dateUtils.ts`.
- **Sync prep**: every DB write should update `updated_at`. Don't skip this — it's required for future sync.

---

## 17. Open Questions / Decisions Deferred

- **Font choice**: placeholder is system font. Pick a warm/retro typeface in Phase 5.
- **Offline reverse geocoding**: for MVP, skip location labels unless a free offline solution is trivial. Otherwise just store lat/lon.
- **Video length limit**: consider capping at 5 minutes for MVP to manage storage.
- **Day boundary**: define when a "day" ends (midnight vs user-defined). MVP: midnight UTC, configurable later.
- **iCloud/Drive backup**: Android backup API can back up the SQLite file. Worth enabling in `android:allowBackup`.
