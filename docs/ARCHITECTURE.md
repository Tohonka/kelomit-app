# Kelomit — Architecture & Code Patterns

Read this before touching code. The patterns here are load-bearing — departing
from them breaks dark mode, causes style recalculation on every render, or breaks
TS strict mode.

*Current as of 2026-07-31, schema v23.*

---

## Tech stack

| Concern | Library | Version | Notes |
|---|---|---|---|
| Framework | React Native (bare) | 0.86.0 | Android only; **New Architecture** |
| Language | TypeScript | ^5.8 | strict mode on |
| Database | `@op-engineering/op-sqlite` | ^16.2 | WAL mode |
| State | Zustand | ^5.0 | one store per domain |
| Navigation | React Navigation | v7 | native-stack + bottom-tabs, custom shell |
| Animation | `react-native-reanimated` + `react-native-worklets` | ^4.5 / ^0.10 | |
| Date math | date-fns | ^4.1 | |
| i18n | i18next + react-i18next | ^26 / ^17 | fi + en |
| Icons | react-native-vector-icons | ^10.2 | MaterialCommunityIcons only |
| GPS | `@react-native-community/geolocation` | ^3.4 | JS side; the real work is native |
| Maps | react-native-maps | ^1.27 | |
| Audio | `react-native-nitro-sound` (playback), `react-native-nitro-audio-record` (16 kHz WAV capture) | ^0.2 / ^0.1 | |
| Transcription | `whisper.rn` | ^0.6 | on-device engine |
| Notifications | `@notifee/react-native` | ^9.1 | |
| Files / zip | react-native-fs, react-native-zip-archive | ^2.20 / ^8.0 | backup |
| Secrets | react-native-keychain | ^10.0 | API keys |
| Server | Hono + better-sqlite3 + puppeteer-core | — | `server/`, separate package |

---

## File structure

```
src/
  db/                   # Raw SQLite access — no business logic
    database.ts         # Opens DB, runs migrations, exports `db`
    migrations.ts       # Versioned SQL migration array (append at the bottom)
    days.ts  entries.ts  projects.ts  tags.ts  settings.ts
    gps.ts  locations.ts  routeHistory.ts  activityEvents.ts
    leaveRanges.ts  dayConfirmations.ts  activeSession.ts

  store/                # Zustand stores — single source of truth for UI
    dayStore  entryStore  projectStore  tagStore
    settingsStore  sessionStore  locationStore

  screens/
    HomeScreen  CalendarScreen  DayScreen  DayMapScreen  MapTab
    GalleryScreen  SearchScreen  InsightsScreen  TagsScreen  ProjectsScreen
    AddEntryModal  QuickAddModal  SettingsScreen
    settings/          # One screen per settings section (11 of them)

  components/
    ui/                 # Generic reusable (Button, Card, ActionSheet, pickers…)
    day/  entries/  media/  map/  insights/  quickadd/

  navigation/
    NavShell.tsx        # The glass shell that wraps everything
    TopFeatureBar.tsx  BottomPill.tsx  QuickAddButton.tsx
    RootNavigator.tsx  MainTabs.tsx  navigationTypes.ts  shellMetrics.ts

  services/
    workReport.ts       # PURE report builder — shared with the server
    workReportExport.ts # On-device PDF export flow
    gpsService  trackingOrchestrator  trackingMode  locationUtils
    routeHistoryService  placesService  crossingStore  sessionService
    sessionLogic  syncService  syncSettings  backupService
    notificationService  permissionService  nativeEventSync  diag
    transcription/      # Whisper API + on-device engines behind one seam

  native/               # Thin JS wrappers over the Kotlin modules
    backgroundLocation.ts  widgetSession.ts  workReport.ts

  utils/                # Pure helpers — hoursUtils, payPeriod, routeSegments,
                        # routeStats, geofence, timeFormat, exportUtils, …
  theme/                # colors.ts, useTheme.ts, index.ts
  types/index.ts        # All shared types

android/app/src/main/java/com/kelomitapp/
  location/             # Foreground service, AR receivers, geofencing, journal
  reporting/            # WorkReport Canvas → PdfDocument renderer
  widget/               # Home-screen session widgets

server/src/             # Hono app: api.ts, web.ts, report.ts routes,
                        # db.ts, pdf.ts, render.ts, reportSheet.ts, ingest.ts
```

---

## Database schema (v23)

Tables: `days`, `entries`, `entry_media`, `entry_tags`, `tags`, `projects`,
`settings`, `schema_version`, `gps_track`, `activity_events`, `locations`,
`named_places`, `place_cache`, `geofence_events`, `day_route_stops`,
`day_route_segments`, `day_end_confirmations`, `leave_ranges`, `diag_log`.

```sql
days (id, date UNIQUE,
      started_at, ended_at,           -- work leg 1
      started_at_2, ended_at_2,       -- work leg 2 (split days)
      started_at_source, ended_at_source,   -- 'manual' | auto-detection
      notes, created_at, updated_at)

entries (
  id, day_id → days.id CASCADE,
  entry_type    CHECK('note','photo','video','voice'),   -- IMMUTABLE
  activity_type CHECK('work','personal_work','personal'),
  title, body,
  project_id → projects.id SET NULL,
  file_path, thumbnail_path, duration_sec,
  time_from, time_to,               -- every entry resolves to a real from→to
  latitude, longitude, location_label,
  is_overtime,                                    -- payroll classification
  is_todo, scheduled_date, completed_at, reminder_at,
  created_at, updated_at)

leave_ranges (id, type CHECK('paid_day_off','unpaid_day_off','vacation','sick'),
              start_date, end_date, CHECK(start_date <= end_date))

-- Raw GPS evidence, 45-day retention. Never derived-from-derived.
gps_track (id, day_id, latitude, longitude, accuracy, altitude, speed, timestamp)
activity_events (id, activity, transition CHECK('enter','exit'), timestamp,
                 UNIQUE(activity, transition, timestamp))

-- Derived from the two tables above; fully rerunnable.
day_route_stops (id, day_id, start_ts, end_ts, latitude, longitude,
                 saved_location_id, named_place_id, google_place_id,
                 display_name, name_source, user_edited)
day_route_segments (id, day_id, sequence, start_ts, end_ts,
                    origin_stop_id, destination_stop_id, coordinates_json,
                    distance_m, duration_sec, average_speed_mps,
                    maximum_speed_mps, raw_last_ts)
```

**Adding a migration:** append to the `migrations` array in `src/db/migrations.ts`
with the next version number. The runner applies missing versions on startup.
Migrations are additive — never rewrite an existing one.

**Raw vs. derived is the rule.** `gps_track` and `activity_events` are source
evidence. Stops and segments are derived by pure functions and reconciled by a
single writer, so a derivation-logic change is a recompute, not a data loss.

---

## Theming pattern

**The rule:** every file that uses theme colors must use `useTheme()`. Static
imports of `colors` are wrong — they always return light colors.

```typescript
// At module level (outside the component):
const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: { backgroundColor: c.bg },
    title: { color: c.textPrimary, fontSize: typography.sizes.lg },
    // typography, spacing, radius are static — use directly
  });

// Inside the component:
const { colors, isDark } = useTheme();
const styles = useMemo(() => makeStyles(colors), [colors]);
```

`useTheme()` reads `settingsStore.theme_mode` (`'system' | 'light' | 'dark'`) and
`useColorScheme()`, then picks `lightColors` or `darkColors`.

**Palette:** "liquid glass" synthwave, dark-first (July 2026 redesign — the warm
terracotta theme is gone). Tokens in `src/theme/colors.ts`:
- `bg`, `bgCard`, `bgMuted`, `swatch` — background layers
- `primary` / `primaryLight` / `primaryDark` — pink `#D0268C`
- `accentPink` / `accentAmber` / `accentCyan` — the three activity hues
- `glassTopBar`, `glassPill`, `glassBorder`, `glassHighlight` — translucent nav
  fills (blur is faked; no blur library on Android)
- `timerBg`, `timerBorder` — live-timer card
- `textPrimary` / `textSecondary` / `textMuted`, `badge*`, `error`, `success`,
  `border`, `shadow`, `white`

---

## Shared app ↔ server code

`src/services/workReport.ts` and `src/utils/hoursUtils.ts` are **pure and
imported directly by the server** (`server/src/routes/report.ts` reaches across
with a relative import; the Dockerfile copies them into the image). Keep them
free of React Native imports, native modules and DB access — they take plain data
and return plain data. Breaking that breaks the server build.

The report has two renderers of the *same* model, which must be kept visually in
sync by hand:
- **Phone:** `android/.../reporting/WorkReportRenderer.kt` — Canvas + `PdfDocument`
- **Server:** `server/src/reportSheet.ts` — HTML/CSS printed by Chromium

Every constant in `reportSheet.ts` is lifted from `WorkReportLayout.kt`. A4 is
595×842 pt, so the Kotlin constants are already CSS points and carry over 1:1.

---

## Store pattern (Zustand)

Stores are the single source of truth. Components read from stores, never
directly from the DB.

```typescript
const { entries, loadEntriesForDay, addEntry, editEntry, removeEntry } = useEntryStore();
```

Each store has a `loaded: boolean` and an async `load()`. Check `loaded` before
rendering data.

---

## Native modules

Three Kotlin packages, each with a thin JS wrapper in `src/native/`:

- **`location/`** — `LocationService` is a foreground service running a
  fast/slow power ladder. Activity Recognition transitions and geofence crossings
  arrive via receivers and are appended to `NativeEventJournal`, a durable
  on-disk journal that JS drains and validates into SQLite. `TrackingPolicy` and
  `WorkdayPolicy` hold the decision logic.
- **`reporting/`** — `WorkReportModule` takes the JSON report model and returns a
  rendered PDF path.
- **`widget/`** — home-screen session widgets.

---

## Known gotchas

1. **New Architecture native→JS events:** use `reactHost`, *not*
   `reactNativeHost` (which throws on New Arch), and emit with
   `ReactContext.emitDeviceEvent`.

2. **Worklets:** a function called from a worklet needs its own `'worklet'`
   directive. Jest cannot catch this — it fails only on device.

3. **RNGH inside `<Modal>`:** gestures are dead unless the modal contains its own
   `<GestureHandlerRootView>`.

4. **`Alert` with 3+ buttons:** Android drops the 4th. Use `components/ui/ActionSheet`
   for multi-action menus.

5. **`android.permission.VIBRATE`** must be in AndroidManifest.xml or the app
   crashes on entry save.

6. **`entry_type` is immutable** — CHECK constraint in the schema, and
   `updateEntry` intentionally omits it. The edit modal disables the selector.

7. **Styles must use `useMemo`** with `makeStyles(colors)` — never call
   `StyleSheet.create()` in render, never import `colors` statically.

8. **Sideloading:** permission or component changes break in-place updates.
   Uninstall → reinstall, and back up the DB first.

9. **GPS "straight lines" are usually device state**, not code — revoked Location
   or Battery permissions kill the foreground service. Check permissions and
   `adb logcat -s KelomitLoc` before touching the tracking ladder.

10. **Native tracking changes are compile-verified only** until a real
    walk/drive/store trip confirms them on a rebuilt, reinstalled app.
