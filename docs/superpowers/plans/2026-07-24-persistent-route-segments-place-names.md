# Persistent Route Segments and Place Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist meaningful, independently colored daily route segments and historically stable place names while retaining raw GPS fixes for 45 days.

**Architecture:** Keep native Android as the owner of location capture, movement wakeups, buffering, and saved-location geofences. Derive route stops and segments in TypeScript after accepted fixes reach SQLite, persist those summaries transactionally, and let map screens render the persisted history. Reconcile incrementally after live writes, once per affected day after native-buffer imports, and lazily when a map opens or startup finds stale derived data.

**Tech Stack:** React Native 0.86, TypeScript, SQLite via `@op-engineering/op-sqlite`, React Navigation, `react-native-maps`, Jest, Google Places Nearby Search (New).

## Global Constraints

- Do not change Kotlin location capture, Activity Recognition, native geofences, GPS filtering, adaptive sampling, or native buffering.
- Reusable named places are retrospective map anchors only. Never pass them to `syncPlaces()` or workday detection.
- Preserve accepted raw-point ordering and the current accuracy/jitter gate. The segmenter consumes only stored `gps_track` rows.
- A known saved/reusable place splits a route immediately regardless of dwell duration. An unknown stop qualifies only at 300 seconds within 70 m.
- Enter anchors at `radius_m`; exit only beyond `radius_m * 1.25`.
- A qualifying unknown stop cuts the incoming segment at its first clustered point.
- Historical `day_route_stops.display_name` is a snapshot. Rebuilds and later reusable-place renames must not silently change it.
- Google/network/auth failures must not be cached as successful empty candidate lists.
- Raw GPS retention is 45 days. Derived segments/stops and reusable places are not retention-pruned.
- Keep changes small and dependency-free. Do not introduce a global named-place store unless component-local loading proves insufficient.
- Keep `realUserData/` untracked and do not use it in fixtures.

---

## Task 1: Add the persistent schema, domain types, and 45-day retention

**Files:**

- Modify: `src/db/migrations.ts`
- Modify: `src/types/index.ts`
- Modify: `src/db/gps.ts`
- Modify: `__tests__/gpsRetention.test.ts`
- Create: `__tests__/routeSchema.test.ts`

- [ ] **Step 1: Write failing retention and migration-contract tests**

Update `__tests__/gpsRetention.test.ts` so the default is explicit:

```ts
import {GPS_RETENTION_DAYS, retentionCutoffIso} from '../src/db/gps';

it('retains raw fixes for 45 days by default', () => {
  expect(GPS_RETENTION_DAYS).toBe(45);
  const now = Date.parse('2026-07-24T12:00:00.000Z');
  expect(retentionCutoffIso(now, GPS_RETENTION_DAYS))
    .toBe('2026-06-09T12:00:00.000Z');
});
```

Add `__tests__/routeSchema.test.ts` and assert migration 20 contains:

- all three new tables;
- `place_cache.candidates_json`;
- `ON DELETE CASCADE` from route summaries to `days`;
- `ON DELETE SET NULL` from historical rows to `named_places`;
- the day/sequence, day/time, and foreign-key indexes.

Import the exported `migrations` array and inspect `migration.up`; do not initialize a real device database in Jest.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- --runInBand __tests__/gpsRetention.test.ts __tests__/routeSchema.test.ts
```

Expected: failures because `GPS_RETENTION_DAYS` and migration 20 do not exist.

- [ ] **Step 3: Add migration 20**

Append one migration in `src/db/migrations.ts`:

```ts
{
  version: 20,
  up: [
    `CREATE TABLE IF NOT EXISTS named_places (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      radius_m REAL NOT NULL DEFAULT 70,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS day_route_stops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
      start_ts TEXT NOT NULL,
      end_ts TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      saved_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
      named_place_id INTEGER REFERENCES named_places(id) ON DELETE SET NULL,
      google_place_id TEXT,
      display_name TEXT,
      name_source TEXT NOT NULL DEFAULT 'unknown'
        CHECK (name_source IN ('saved','reusable','google','day','unknown')),
      user_edited INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS day_route_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      start_ts TEXT NOT NULL,
      end_ts TEXT NOT NULL,
      origin_stop_id INTEGER REFERENCES day_route_stops(id) ON DELETE SET NULL,
      destination_stop_id INTEGER REFERENCES day_route_stops(id) ON DELETE SET NULL,
      coordinates_json TEXT NOT NULL,
      distance_m REAL NOT NULL,
      duration_sec REAL NOT NULL,
      average_speed_mps REAL NOT NULL,
      maximum_speed_mps REAL NOT NULL,
      raw_last_ts TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(day_id, sequence)
    )`,
    'ALTER TABLE place_cache ADD COLUMN candidates_json TEXT',
    'CREATE INDEX IF NOT EXISTS idx_named_places_coords ON named_places(latitude, longitude)',
    'CREATE INDEX IF NOT EXISTS idx_route_stops_day_time ON day_route_stops(day_id, start_ts)',
    'CREATE INDEX IF NOT EXISTS idx_route_stops_saved ON day_route_stops(saved_location_id)',
    'CREATE INDEX IF NOT EXISTS idx_route_stops_named ON day_route_stops(named_place_id)',
    'CREATE INDEX IF NOT EXISTS idx_route_segments_day_sequence ON day_route_segments(day_id, sequence)',
    'CREATE INDEX IF NOT EXISTS idx_route_segments_origin ON day_route_segments(origin_stop_id)',
    'CREATE INDEX IF NOT EXISTS idx_route_segments_destination ON day_route_segments(destination_stop_id)',
  ],
},
```

The existing saved-place table is `locations`; use that exact foreign-key target.

- [ ] **Step 4: Add domain types**

In `src/types/index.ts`, add:

```ts
export type RouteStopNameSource =
  | 'saved'
  | 'reusable'
  | 'google'
  | 'day'
  | 'unknown';

export interface NamedPlace { /* schema fields with number/string types */ }
export interface DayRouteStop { /* schema fields; nullable IDs/names */ }
export interface RouteCoordinate {latitude: number; longitude: number}
export interface DayRouteSegment {
  /* schema fields */
  coordinates: RouteCoordinate[];
}
```

Keep database snake-case field names consistent with existing `GpsPoint` and `SavedLocation` conventions.

- [ ] **Step 5: Change the raw retention default**

In `src/db/gps.ts`:

```ts
export const GPS_RETENTION_DAYS = 45;

export async function pruneGpsTracksOlderThan(
  days = GPS_RETENTION_DAYS,
): Promise<void> { /* existing body */ }
```

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
npm test -- --runInBand __tests__/gpsRetention.test.ts __tests__/routeSchema.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/db/migrations.ts src/types/index.ts src/db/gps.ts __tests__/gpsRetention.test.ts __tests__/routeSchema.test.ts
git commit -m "feat: add persistent route history schema"
```

---

## Task 2: Derive anchors, five-minute stops, and trip summaries from raw points

**Files:**

- Create: `src/utils/routeSegments.ts`
- Create: `__tests__/routeSegments.test.ts`
- Reference: `src/utils/visitedLocations.ts`
- Reference: `src/services/locationUtils.ts`

- [ ] **Step 1: Define test builders and write failing behavioral tests**

Use fixed ISO timestamps and small point/anchor builders. Cover these exact cases:

1. Office → three-minute Training Yard → Office creates two segments and two yard boundary events.
2. An unknown cluster lasting 299 seconds does not split.
3. An unknown cluster lasting exactly 300 seconds splits at the cluster's first point.
4. A saved/reusable anchor uses entry radius and 1.25 exit hysteresis.
5. Overlapping anchors select the nearest containing center.
6. Points inside anchors are omitted from segment geometry.
7. A GPS time gap without spatial dwell creates no boundary.
8. A partial day emits a segment with a nullable origin or destination.
9. Midnight is never crossed because input is day-scoped.
10. Distance, duration, weighted average speed, and maximum recorded speed are correct.

The public contract:

```ts
export interface RouteAnchor {
  id: number;
  type: 'saved' | 'reusable';
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
}

export interface DerivedRouteStop {
  key: string;
  startTs: string;
  endTs: string;
  latitude: number;
  longitude: number;
  anchor: RouteAnchor | null;
}

export interface DerivedRouteSegment {
  sequence: number;
  startTs: string;
  endTs: string;
  originStopKey: string | null;
  destinationStopKey: string | null;
  coordinates: RouteCoordinate[];
  distanceM: number;
  durationSec: number;
  averageSpeedMps: number;
  maximumSpeedMps: number;
  rawLastTs: string;
}

export function deriveRouteDay(
  points: GpsPoint[],
  anchors: RouteAnchor[],
): {stops: DerivedRouteStop[]; segments: DerivedRouteSegment[]};
```

- [ ] **Step 2: Run the test and verify RED**

```bash
npm test -- --runInBand __tests__/routeSegments.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement deterministic anchor membership**

In `routeSegments.ts`:

- sort a copy of points by timestamp;
- track the active anchor;
- when outside, select the nearest anchor whose distance is `<= radiusM`;
- while inside, remain inside until distance is `> radiusM * 1.25`;
- emit a known stop covering the inside interval;
- exclude inside points from movement geometry.

Reuse `distanceMeters`; do not duplicate Haversine math.

- [ ] **Step 4: Implement tentative unknown dwell clusters**

Outside anchors, maintain a greedy running centroid matching `visitedLocations.ts`:

- points within 70 m extend the tentative cluster;
- once span reaches 300 seconds, mark the cluster as a stop;
- when movement leaves the cluster, close it;
- when qualified, move the split boundary back to the cluster's first point;
- when unqualified, keep its points in the current trip.

Do not call Google Places from this pure utility.

- [ ] **Step 5: Build segments and statistics**

For every movement fragment with at least two points:

- store only `{latitude, longitude}`;
- calculate distance between consecutive coordinates;
- calculate duration from first to last movement timestamp;
- compute `averageSpeedMps = distanceM / durationSec` with zero guard;
- use the largest finite non-negative raw `speed`, falling back to per-leg speed only when no recorded speed exists;
- assign chronological zero-based `sequence`;
- attach origin/destination stop keys when present.

- [ ] **Step 6: Run tests and typecheck**

```bash
npm test -- --runInBand __tests__/routeSegments.test.ts __tests__/visitedLocations.test.ts __tests__/routeStats.test.ts
npx tsc --noEmit
```

Expected: PASS, including existing dwell behavior.

- [ ] **Step 7: Commit**

```bash
git add src/utils/routeSegments.ts __tests__/routeSegments.test.ts
git commit -m "feat: derive daily route segments and stops"
```

---

## Task 3: Add the route-history repository and snapshot-preserving reconciliation

**Files:**

- Create: `src/db/routeHistory.ts`
- Create: `__tests__/routeHistory.test.ts`
- Modify: `src/db/gps.ts`
- Reference: `src/db/database.ts`

- [ ] **Step 1: Write failing repository tests with a mocked database**

Mock `getDB()` using queued `execute` results and a transaction callback. Verify:

- `getNamedPlaces()` maps and orders rows by case-insensitive name;
- `createNamedPlace()` trims the name and rejects whitespace without SQL;
- `renameNamedPlace()` changes only `named_places`, never historical stop rows;
- `getDayRouteHistory()` parses `coordinates_json` and rejects malformed/non-array geometry safely as `[]`;
- `getLatestRawTimestamp(dayId)` returns the newest `gps_track.timestamp`;
- `getLatestDerivedRawTimestamp(dayId)` returns the greatest segment `raw_last_ts`;
- reconciliation uses one transaction;
- explicit `user_edited=1` identity survives a rebuild;
- an existing non-empty automatic Google snapshot survives a rebuild;
- unmatched obsolete summaries are removed;
- newly derived saved/reusable stops receive their anchor name snapshot.

- [ ] **Step 2: Run the test and verify RED**

```bash
npm test -- --runInBand __tests__/routeHistory.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement named-place and history reads**

Export:

```ts
getNamedPlaces(): Promise<NamedPlace[]>
createNamedPlace(input: {name: string; latitude: number; longitude: number; radiusM?: number}): Promise<NamedPlace>
renameNamedPlace(id: number, name: string): Promise<void>
getDayRouteHistory(dayId: number): Promise<{stops: DayRouteStop[]; segments: DayRouteSegment[]}>
getLatestRawTimestamp(dayId: number): Promise<string | null>
getLatestDerivedRawTimestamp(dayId: number): Promise<string | null>
```

Validate names in TypeScript before SQL. Parameterize every value.

- [ ] **Step 4: Implement pure old/new stop matching**

Export for direct testing:

```ts
matchExistingStop(
  next: DerivedRouteStop,
  candidates: DayRouteStop[],
): DayRouteStop | null
```

Eligible candidates must:

- overlap in time; and
- be within 70 m of the new centroid.

Choose the greatest overlap, then nearest distance, then lowest ID. Each old stop may be consumed once.

- [ ] **Step 5: Implement transactional reconciliation**

Export:

```ts
reconcileDayRouteHistory(
  dayId: number,
  derived: ReturnType<typeof deriveRouteDay>,
): Promise<void>
```

Inside one `_db.transaction()`:

1. read existing stops;
2. match each new stop;
3. update matched rows' time/centroid/anchor fields while preserving every existing non-empty `display_name`;
4. preserve `google_place_id`, `named_place_id`, `name_source`, and `user_edited` for explicit choices;
5. insert unmatched stops with saved/reusable snapshots or `unknown`;
6. delete old unmatched segments, then old unmatched stops;
7. insert the new segments using retained/inserted stop IDs and JSON geometry.

Delete segments before stops to satisfy foreign keys. Do not use `INSERT OR REPLACE`, which would churn IDs and references.

- [ ] **Step 6: Add a day-ID query for startup stale checks**

In `src/db/gps.ts`, add:

```ts
export async function getGpsDayIdsWithinRetention(
  days = GPS_RETENTION_DAYS,
): Promise<number[]>
```

It returns distinct day IDs whose raw points are newer than the cutoff. Add its mocked-SQL behavior to `__tests__/routeHistory.test.ts` or a focused GPS DB test.

- [ ] **Step 7: Run focused tests and typecheck**

```bash
npm test -- --runInBand __tests__/routeHistory.test.ts __tests__/routeSegments.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/db/routeHistory.ts src/db/gps.ts __tests__/routeHistory.test.ts
git commit -m "feat: persist reconciled route history"
```

---

## Task 4: Reconcile live fixes, native buffer imports, startup, and map focus

**Files:**

- Create: `src/services/routeHistoryService.ts`
- Create: `__tests__/routeHistoryService.test.ts`
- Modify: `src/services/gpsService.ts`
- Modify: `src/services/trackingOrchestrator.ts`
- Modify: `App.tsx`

- [ ] **Step 1: Write failing service tests**

Mock GPS, locations, named places, derivation, and repository functions. Verify:

- `refreshRouteDay(dayId)` loads raw points, saved locations, and named places, derives once, and reconciles once;
- `refreshRouteDayIfStale(dayId)` skips when raw and derived timestamps match;
- it rebuilds when derived history is absent or older;
- `scheduleRouteRefresh(dayId)` coalesces repeated writes for one day;
- different day IDs keep separate timers;
- `reconcileRecentRouteDays()` checks only raw day IDs inside the 45-day window;
- a failed refresh is diagnosed but does not reject a live GPS write.

Use fake timers and export a test-only reset function only if module timers cannot otherwise be isolated.

- [ ] **Step 2: Run the test and verify RED**

```bash
npm test -- --runInBand __tests__/routeHistoryService.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement the reconciliation service**

Export:

```ts
refreshRouteDay(dayId: number): Promise<void>
refreshRouteDayIfStale(dayId: number): Promise<boolean>
scheduleRouteRefresh(dayId: number): void
reconcileRecentRouteDays(): Promise<void>
```

Use a 15-second per-day debounce. Convert saved and reusable places into `RouteAnchor[]` here. Catch scheduled errors and log `route.refresh.fail` through `diag`.

- [ ] **Step 4: Schedule after each stored live fix**

In `gpsService.persistFix()`:

- call `scheduleRouteRefresh(day.id)` only after `insertGpsPoint()` succeeds;
- do not schedule for jitter/low-quality fixes that were not stored;
- do not wait for derivation before returning from the live fix path.

- [ ] **Step 5: Refresh buffered days once**

Change `persistFix()` to return `{ok: boolean; storedDayId: number | null}` or an equivalent explicit result. In `importBufferedFixes()`:

- collect stored day IDs in a `Set<number>`;
- acknowledge successfully processed lines exactly as today;
- after acknowledgement, `await refreshRouteDay(dayId)` once for each affected day;
- a derived refresh failure must not undo buffer acknowledgement because the raw point is durable and startup can retry.

- [ ] **Step 6: Add startup reconciliation**

In `trackingOrchestrator.ts`, export:

```ts
export async function reconcileRouteHistory(): Promise<void> {
  await reconcileRecentRouteDays();
}
```

In `App.tsx`, call it after `reconcileTrackingJournal()` and before the delayed GPS startup. Catch and diagnose `route.launch.fail` without blocking the UI.

- [ ] **Step 7: Run service, GPS, and orchestrator tests**

Update existing mocks for the changed `persistFix` flow where necessary:

```bash
npm test -- --runInBand __tests__/routeHistoryService.test.ts __tests__/gpsService.test.ts __tests__/trackingOrchestrator.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/services/routeHistoryService.ts src/services/gpsService.ts src/services/trackingOrchestrator.ts App.tsx __tests__/routeHistoryService.test.ts __tests__/gpsService.test.ts __tests__/trackingOrchestrator.test.ts
git commit -m "feat: reconcile route history across tracking lifecycle"
```

---

## Task 5: Persist nearby Google candidates and day-specific name choices

**Files:**

- Modify: `src/services/placesService.ts`
- Modify: `src/db/routeHistory.ts`
- Create: `__tests__/placesService.test.ts`
- Modify: `__tests__/routeHistory.test.ts`

- [ ] **Step 1: Write failing Places tests**

Mock `getDB`, `getMapsApiKey`, and `fetch`. Verify:

- cached candidate JSON returns without network;
- malformed cached JSON triggers a fresh lookup;
- request uses `maxResultCount: 10`, radius 60, and field mask `places.displayName,places.id,places.location`;
- results are normalized and sorted locally by distance;
- successful results persist both the nearest automatic name and candidate JSON;
- an empty successful result stores `[]`;
- missing key, rejected fetch, non-2xx, and malformed response do not write candidate cache;
- legacy cache rows still satisfy `resolvePlaceName()`.

Public type:

```ts
export interface PlaceCandidate {
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
  distanceM: number;
}
```

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -- --runInBand __tests__/placesService.test.ts
```

Expected: failures because candidate APIs do not exist.

- [ ] **Step 3: Implement candidate cache/read-through**

Add:

```ts
resolvePlaceCandidates(lat: number, lng: number): Promise<PlaceCandidate[]>
```

Keep `resolvePlaceName()` compatible. A successful candidate lookup should update `name`, `place_id`, `fetched_at`, and `candidates_json` together. Never overwrite a useful legacy nearest name on a failed request.

- [ ] **Step 4: Add local nearby choices and day snapshot mutations**

In `routeHistory.ts`, add:

```ts
getNearbyLocalPlaces(lat: number, lng: number, radiusM?: number): Promise<Array<{
  type: 'saved' | 'reusable';
  id: number;
  name: string;
  distanceM: number;
}>>

setDayStopName(stopId: number, choice:
  | {type: 'saved'; id: number; name: string}
  | {type: 'reusable'; id: number; name: string}
  | {type: 'google'; placeId: string; name: string}
  | {type: 'day'; name: string}
): Promise<void>
```

Every choice writes `display_name`, source/link fields, and `user_edited=1` only on the selected `day_route_stops` row. Clear mutually exclusive link fields.

Add `createNamedPlaceForStop(stopId, name)` as one transaction: read centroid, insert named place, then apply its snapshot to that stop.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
npm test -- --runInBand __tests__/placesService.test.ts __tests__/routeHistory.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/placesService.ts src/db/routeHistory.ts __tests__/placesService.test.ts __tests__/routeHistory.test.ts
git commit -m "feat: persist route place candidates and name choices"
```

---

## Task 6: Replace ephemeral location naming with a correction sheet

**Files:**

- Create: `src/components/map/PlaceNameSheet.tsx`
- Create: `__tests__/PlaceNameSheet.test.tsx`
- Modify: `src/screens/MapTab.tsx`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/fi.ts`

- [ ] **Step 1: Write failing component tests**

Using `react-test-renderer` and mocked callbacks, verify:

- local saved/reusable choices render before Google candidates;
- type and distance are announced in visible text;
- pressing a choice calls `onChoose` once and closes;
- “Name this place…” opens a text input;
- whitespace-only names keep Save disabled;
- a valid name calls `onCreateName(trimmedName)`;
- Google loading/failure leaves local choices and naming available;
- the current historical name remains visible when candidate loading fails.

- [ ] **Step 2: Run the test and verify RED**

```bash
npm test -- --runInBand __tests__/PlaceNameSheet.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement the plain React Native sheet**

Use `Modal`, `TouchableOpacity`, `TextInput`, and existing theme tokens. Props should carry data and callbacks; the component must not access SQLite directly.

Include accessible button labels and keyboard-safe scrolling. Do not reuse the text-only `ActionSheet` if it makes the input flow awkward.

- [ ] **Step 4: Make persisted route stops the Places list source**

In `MapTab.tsx`:

- remove `visitedLocations()` and component-local `names`;
- render persisted `DayRouteStop[]`;
- make each name row a button;
- open the sheet with nearby local choices immediately;
- load Google candidates only when the sheet opens;
- on selection, call `setDayStopName()`, reload route history, and leave geometry unchanged;
- on “Name this place”, call `createNamedPlaceForStop()`, reload route history, then call `refreshRouteDay(dayId)` so future visits can match the new anchor while preserving current snapshots.

Do not add the reusable place to `useLocationStore`.

- [ ] **Step 5: Add English and Finnish strings**

Add keys for:

- Places/Trips headings;
- saved place/reusable place labels;
- distance-away label;
- choose place/name this place/place name/save/cancel;
- loading/error/unknown;
- day start/day end.

Keep punctuation and interpolation conventions consistent with the existing locale files.

- [ ] **Step 6: Run tests, localization checks, and typecheck**

```bash
npm test -- --runInBand __tests__/PlaceNameSheet.test.tsx __tests__/placesService.test.ts __tests__/i18n.test.ts
npx tsc --noEmit
```

There is no locale-parity Jest test in the current tree; TypeScript compilation verifies both locale modules, and the device pass verifies the rendered Finnish and English labels.

- [ ] **Step 7: Commit**

```bash
git add src/components/map/PlaceNameSheet.tsx src/screens/MapTab.tsx src/i18n/locales/en.ts src/i18n/locales/fi.ts __tests__/PlaceNameSheet.test.tsx
git commit -m "feat: add historical place naming controls"
```

---

## Task 7: Draw persistent colored segments and add the trip legend

**Files:**

- Modify: `src/screens/DayMapScreen.tsx`
- Modify: `src/screens/MapTab.tsx`
- Create: `src/components/map/TripList.tsx`
- Create: `__tests__/TripList.test.tsx`
- Modify: `__tests__/routeHistoryService.test.ts`

- [ ] **Step 1: Write failing presentation tests**

For `TripList` verify:

- chronological rows use the same fixed palette index as their polyline;
- rows show `Origin → Destination`, local start/end, distance, and duration;
- missing endpoints use localized Day start/Day end;
- zero segments render the existing no-route state without a blank card.

Add a stale-focus test proving `useDayMapData(dayId)` invokes `refreshRouteDayIfStale(dayId)` before reloading persisted history. If hook testing is too coupled to navigation, extract and test a single `loadDayMapData(dayId)` async function rather than snapshotting the whole screen.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npm test -- --runInBand __tests__/TripList.test.tsx __tests__/routeHistoryService.test.ts
```

Expected: missing component/behavior failures.

- [ ] **Step 3: Change the day-map data contract**

Replace `routeCoords` with:

```ts
segments: DayRouteSegment[];
stops: DayRouteStop[];
routeCoords: RouteCoordinate[]; // flattened only for region and first/last markers
```

On focus:

1. call `refreshRouteDayIfStale(dayId)`;
2. load `getDayRouteHistory(dayId)`;
3. load entries;
4. keep raw-point loading only if still needed for a diagnostic fallback—normal rendering and stats must use summaries.

Day stats become sums of segment distance/duration.

- [ ] **Step 4: Draw one polyline per persisted segment**

Define and export one palette near `DayMapCanvas`:

```ts
export const ROUTE_SEGMENT_COLORS = [
  '#2563EB',
  '#D97706',
  '#059669',
  '#9333EA',
  '#DC2626',
];
```

Confirm contrast against both light and dark map styles. Render:

```tsx
{segments.map((segment, index) => (
  <Polyline
    key={segment.id}
    coordinates={segment.coordinates}
    strokeColor={ROUTE_SEGMENT_COLORS[index % ROUTE_SEGMENT_COLORS.length]}
    strokeWidth={4}
  />
))}
```

Keep only the first movement coordinate start marker and last movement coordinate end marker. Do not add stop markers in this release.

- [ ] **Step 5: Add the Trips section**

Implement `TripList.tsx` with read-only rows and swatches from the same exported palette. Add it below Locations in `MapOverview`.

Use stop IDs to resolve frozen display names. Do not resolve names through mutable saved/reusable records at render time.

- [ ] **Step 6: Run focused and map regression tests**

```bash
npm test -- --runInBand __tests__/TripList.test.tsx __tests__/routeSegments.test.ts __tests__/routeHistoryService.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/screens/DayMapScreen.tsx src/screens/MapTab.tsx src/components/map/TripList.tsx __tests__/TripList.test.tsx __tests__/routeHistoryService.test.ts
git commit -m "feat: show colored route segments and trip summaries"
```

---

## Task 8: Verify migration, backup coverage, regressions, and real-device behavior

**Files:**

- Modify only if verification finds defects.
- Reference: existing backup/restore implementation found with `rg -n "backup|restore|kelomit.db" src android`

- [ ] **Step 1: Prove backup/restore coverage**

Inspect the current backup implementation and record evidence in the commit/PR notes that it copies the whole SQLite database rather than a table allowlist. If it is a table allowlist, add all three new tables and `place_cache.candidates_json`, then add a focused backup test.

- [ ] **Step 2: Run the complete automated gate**

Because temporary worktrees can confuse Jest, ensure `.worktrees/` is ignored or run from the primary tree:

```bash
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm test -- --runInBand
git diff --check
```

Expected: all pass. If the repository has a documented unrelated lint baseline, report exact pre-existing failures and run ESLint on every touched TypeScript file.

- [ ] **Step 3: Build Android**

```bash
cd android
./gradlew assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Run migration and persistence checks on an expendable emulator/device**

Verify:

- upgrading an existing version-19 DB reaches version 20 without losing days, entries, locations, GPS, reporting settings, or place cache;
- a fresh install creates every table/index;
- backup, destructive local test edit, and restore recover named places, stop snapshots, segment geometry, and candidate cache;
- app relaunch renders persisted segments without network.

- [ ] **Step 5: Run the approved route scenarios on device**

Capture diagnostic timestamps and verify:

1. Office → 3-minute Training Yard → Office shows two trips.
2. A traffic-light stop under five minutes stays in one trip.
3. An unknown stop over five minutes splits at arrival, not five minutes late.
4. A short saved/reusable-place visit splits immediately.
5. Stationary drift inside known places does not draw scribbles.
6. Background/native-buffered travel appears after returning to the app.
7. Consecutive trips rotate colors and the legend swatches match.
8. Day start/end labels appear for partial-day routes.

- [ ] **Step 6: Run the approved naming scenarios on device**

Verify:

1. Google candidates are sorted by distance and selectable.
2. Offline/API failure preserves the historical name and still permits a local name.
3. “Name this place” affects the selected day and future matching visits.
4. Renaming the reusable place does not alter past days.
5. Choosing another name for one day does not rename the reusable place.
6. Reopening an old day does not perform Google lookup when its snapshot exists.
7. Reusable places never appear in Work/Home settings or native geofence diagnostics.

- [ ] **Step 7: Verify retention safely**

On a copied/expendable database, insert raw fixes at 44 and 46 days old, run the prune, and verify:

- 44-day raw fixes remain;
- 46-day raw fixes are deleted;
- `day_route_stops` and `day_route_segments` remain for both days.

- [ ] **Step 8: Fix only evidence-backed defects and rerun the affected gate**

Use `superpowers:systematic-debugging` for any unexpected failure. Add a regression test before each fix.

- [ ] **Step 9: Final commit if verification required changes**

```bash
git status --short
git add path/to/each/verified-fix
git commit -m "fix: harden persistent route history"
```

Replace `path/to/each/verified-fix` with the explicit paths shown by `git status`; never stage unrelated user changes.

- [ ] **Step 10: Finish the branch**

Use `superpowers:finishing-a-development-branch`. Report:

- automated test/type/lint/build evidence;
- real-device scenarios actually completed;
- any remaining device-only verification honestly;
- commit list and integration choices.
