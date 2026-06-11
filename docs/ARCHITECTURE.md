# Kelomit — Architecture & Code Patterns

Read this before touching code. The patterns here are load-bearing — departing from them
breaks dark mode, causes style recalculation on every render, or breaks TS strict mode.

---

## Tech stack

| Concern | Library | Version | Notes |
|---|---|---|---|
| Framework | React Native (bare) | 0.86.0 | Android only for now |
| Language | TypeScript | ^5.8 | strict mode on |
| Database | `@op-engineering/op-sqlite` | ^16.2 | WAL mode, synchronous-style API |
| State | Zustand | ^5.0 | one store per domain |
| Navigation | React Navigation | v7 | native-stack + bottom-tabs |
| Date math | date-fns | ^4.1 | |
| Icons | react-native-vector-icons | ^10.2 | MaterialCommunityIcons only |
| Date/time pickers | `@react-native-community/datetimepicker` | ^9.1 | |
| Audio | `react-native-audio-recorder-player` | **4.1.5 PINNED** | see known issues |
| GPS | `react-native-geolocation-service` | ^5.3 | Google Fused Location |
| Camera / gallery | `react-native-image-picker` | ^8.2 | |
| File system | `react-native-fs` | ^2.20 | |
| Permissions | `react-native-permissions` | ^5.5 | |

---

## File structure

```
src/
  db/                   # Raw SQLite access — no business logic
    database.ts         # Opens DB, runs migrations, exports `db`
    migrations.ts       # Versioned SQL migration array (add new ones at the bottom)
    days.ts             # CRUD for days table
    entries.ts          # CRUD for entries + entry_tags join
    projects.ts
    tags.ts
    settings.ts         # Key/value settings table helpers
    gps.ts

  store/                # Zustand stores — single source of truth for UI
    dayStore.ts
    entryStore.ts
    projectStore.ts
    settingsStore.ts    # Includes theme_mode: ThemeMode
    tagStore.ts

  screens/              # Full-screen components (one per route)
    HomeScreen.tsx
    DayScreen.tsx
    CalendarScreen.tsx
    AddEntryModal.tsx   # Also handles edit (entryId param)
    EntryDetailScreen.tsx
    SettingsScreen.tsx
    ProjectsScreen.tsx

  components/
    ui/                 # Generic reusable: Button, Card, FAB, TimePicker
    day/                # Day-specific: DaySummaryCard, HourBreakdown, FilterBar
    entries/            # Entry display: ActivityBadge, EntryList, EntryListItem,
                        #               EntryTypeIcon, ProjectChip, TagChip
    media/              # Media capture/playback: AudioPlayer, PhotoCapture,
                        #                         VideoCapture, VoiceRecorder, MediaThumbnail

  navigation/
    navigationTypes.ts  # All route param types
    RootNavigator.tsx   # Stack navigator (modal + push screens)
    MainTabs.tsx        # Bottom tab navigator

  services/
    gpsService.ts       # start/stop tracking, getLastKnownPosition()
    locationUtils.ts    # Outlier rejection + Kalman filter
    permissionService.ts

  theme/
    colors.ts           # lightColors, darkColors, Colors type
    useTheme.ts         # useTheme() hook — reads settingsStore + useColorScheme()
    index.ts            # Re-exports everything; static: typography, spacing, radius

  types/                # Shared TypeScript types (Entry, Day, Project, Tag, etc.)
  utils/
    dateUtils.ts
    exportUtils.ts      # CSV export + Share sheet
    hoursUtils.ts       # calcHourBreakdown(), formatHours()
    mediaUtils.ts       # File paths, fileUri(), ensureMediaDir()
```

---

## Database schema (current, v2)

```sql
days (id, date UNIQUE, started_at, ended_at, notes, created_at, updated_at)

projects (id, name UNIQUE, type CHECK('work','personal','other'), archived, ...)

entries (
  id, day_id → days.id CASCADE,
  entry_type  CHECK('note','photo','video','voice'),   -- IMMUTABLE after creation
  activity_type CHECK('work','personal_work','personal'),
  title, body,
  project_id → projects.id SET NULL,
  file_path, thumbnail_path,
  duration_sec,        -- seconds, for voice or manual duration
  time_from, time_to,  -- ISO strings for from–to tracking
  latitude, longitude, location_label,
  created_at, updated_at
)

gps_track (id, day_id → days.id CASCADE, latitude, longitude, accuracy,
           altitude, speed, timestamp)

tags (id, name UNIQUE COLLATE NOCASE, created_at)
entry_tags (entry_id → entries, tag_id → tags, PRIMARY KEY (entry_id, tag_id))

settings (key TEXT PRIMARY KEY, value TEXT)
  -- keys: gps_enabled, gps_interval_ms, default_activity_type,
  --       default_project_id, theme_mode

schema_version (version INTEGER PRIMARY KEY)
```

Adding a migration: append to the `migrations` array in `src/db/migrations.ts` with the next version number. The DB runner applies any missing versions on startup.

---

## Dark mode pattern

**The rule:** every file that uses colors from the theme must use `useTheme()`. Static imports of `colors` from `'../../theme'` are wrong — they always return light colors.

```typescript
// At module level (outside component):
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

`useTheme()` reads `settingsStore.theme_mode` ('system' | 'light' | 'dark') and
`useColorScheme()` from React Native, then picks `lightColors` or `darkColors`.

**Color tokens** (defined in `src/theme/colors.ts`):
- `bg`, `bgCard`, `bgMuted` — background layers (darkest → lightest in light mode, reversed in dark)
- `primary`, `primaryLight`, `primaryDark` — terracotta brand color
- `accent`, `accentLight` — warm gold
- `textPrimary`, `textSecondary`, `textMuted` — text hierarchy
- `badgeWork`, `badgePersonalWork`, `badgePersonal` — activity type colors
- `error`, `success`, `border`, `shadow`, `white`

---

## Navigation types

```typescript
// src/navigation/navigationTypes.ts
export type RootStackParamList = {
  MainTabs: undefined;
  DayScreen: { date: string };           // 'yyyy-MM-dd'
  AddEntryModal: {
    date?: string;
    dayId: number;
    entryId?: number;                    // present = edit mode
  };
  EntryDetailScreen: { entryId: number; dayId: number };
  ProjectsScreen: undefined;
};

export type TabParamList = {
  Home: undefined;
  Calendar: undefined;
  Settings: undefined;
};

// Helper prop types:
// RootStackScreenProps<'DayScreen'>
// TabScreenProps<'Calendar'>
```

---

## Store pattern (Zustand)

Stores are the single source of truth. Components read from stores, never directly from DB.

```typescript
// Typical pattern:
const { entries, loadEntriesForDay, addEntry, editEntry, removeEntry } = useEntryStore();
```

Key stores:
- `useEntryStore` — `entriesByDay: Record<number, Entry[]>`, CRUD ops
- `useDayStore` — `daysCache: Record<string, Day>` (keyed by date string)
- `useSettingsStore` — includes `theme_mode`, `setThemeMode(mode)`
- `useProjectStore`, `useTagStore` — flat arrays with load/CRUD

---

## Edit entry flow

1. `EntryDetailScreen` has an **Edit** button → `navigation.navigate('AddEntryModal', { dayId, entryId: entry.id })`
2. `AddEntryModal` checks `route.params.entryId`: if present, calls `getEntry(entryId)` and pre-fills all state
3. Type selector rendered as disabled (entry_type is immutable)
4. On save: calls `useEntryStore().editEntry(entryId, fields, dayId)` instead of `addEntry`
5. `EntryDetailScreen` has a `navigation.addListener('focus', ...)` that reloads the entry after returning from edit

---

## GPS service

`src/services/gpsService.ts` — call `startTracking(intervalMs)` / `stopTracking()` from app startup or Settings toggle.

`getLastKnownPosition()` returns the latest smoothed position for tagging new entries.

Location points go through `locationUtils.ts`:
- Outlier rejection (distance threshold ~500 m by default)
- Simple Kalman filter for smoothing noisy readings

---

## Media files

All media is stored in `{RNFS.DocumentDirectoryPath}/kelomit_media/`.

`src/utils/mediaUtils.ts` exports:
- `makeMediaPath(type, ext)` — generates a timestamped filename
- `makeThumbnailPath(filePath)` — derives `_thumb` path
- `fileUri(path)` — prepends `file://` for Image/Audio components
- `ensureMediaDir()` — creates the directory if needed

---

## Known gotchas

1. **`react-native-audio-recorder-player` must stay at ^4.1.5** (with `react-native-nitro-modules@^0.26.3`). v4.5.0 references `react-native-nitro-modules@0.51.1` which doesn't exist on npm.

2. **`android.permission.VIBRATE`** must be in `android/app/src/main/AndroidManifest.xml`. Without it the app crashes (silently on older Android) whenever `Vibration.vibrate()` is called on save/delete.

3. **`entry_type` is immutable** — the DB schema has a CHECK constraint and `updateEntry` in `src/db/entries.ts` intentionally omits it from the updatable fields.

4. **Styles must use `useMemo`** with `makeStyles(colors)` — never call `StyleSheet.create()` directly in render, and never import `colors` statically if you need theme-reactive styles.

5. **Stores must be loaded before use** — each store has a `loaded: boolean` flag and a `load()` async function. Check `loaded` in `useEffect` before rendering data.
