# Work arrival/departure detection — redesign

**Date:** 2026-07-13
**Status:** Approved design, pre-implementation
**Depends on:** `feat/gps-ar-parked` (parked state re-enabled; AR wake). Builds on the
verified GPS power ladder.

## Problem

Work arrival/departure detection (auto-filling a day's start/end and asking "did
you leave work at xx:xx?") is the app's oldest feature and predates the whole
location stack it now sits on. It stopped working reliably. Root cause: the
detection is **welded to the live GPS fix stream** — enter/exit crossings are only
detected inside `handlePosition → processGeofences`, and end-of-day inference runs
per-fix (`applyEndOfDay('tick')`). When the phone is parked (zero fixes), dozing,
or the foreground service is killed, there's no fix at the crossing moment, so the
crossing is missed and the day never gets a start/end. Re-enabling the parked state
(`feat/gps-ar-parked`) widened these zero-fix windows.

Confirmed from `realUserData`: detection logic itself is unchanged in git and worked
in all captured data through 07-13 AM (pre-parked build); the failures appear in the
newly-parked build. `geofence_events` is currently **write-only** (no readers). Entry
location-tagging (`entries.latitude/longitude/location_label`) is fully independent
and untouched by this work.

## Goals

- Detect work arrival/departure from **persisted data**, independent of whether a
  GPS fix arrives at the crossing instant — the decoupling the user asked for.
- Reliable single-block day: `started_at` = first work arrival; `ended_at` = last
  work departure (commute home not counted).
- Keep the "did you leave work at xx:xx?" confirmation for genuinely uncertain days.
- Never overwrite a manually-entered time.
- Be a net simplification: delete the per-fix eod coupling.

## Non-goals (explicit)

- **Force-kill hardening.** Crossings still require the RN context to be alive (the
  foreground service keeps it warm). A full process force-kill mid-commute can still
  drop a crossing; fixing that needs a headless-JS task — deferred until proven
  necessary.
- **Power ladder redesign.** Fast/slow/parked is verified and stays. This work only
  touches `canPark` to *remove* a coupling term (below).
- **Leg 2 / midday split auto-detection.** Single block by decision; leg 2
  (`started_at_2`/`ended_at_2`) stays manual (exceptional days; overtime after day
  end is added manually as notes).
- **Midnight-spanning work.** Rare now, but expected to matter closer to winter
  (darker season / later or night work) — deferred, not dismissed. When addressed:
  a crossing/day belongs to the day of the first work arrival, and start/end may
  span past midnight, so inference must key off the work-session's origin day rather
  than the calendar date of each crossing.
- Entry location-tagging, the map, CSV export — untouched.

## Architecture

One-directional flow, three isolated units:

```
CROSSING PRODUCERS ──▶ CROSSING STORE ──▶ INFERENCE (pure) ──▶ day start/end + confirmation
```

### 1. Crossing producers (two, both emit "entered/left place X at time T")

- **Primary — OS geofencing.** Always-on OS geofences for home + both work
  locations whenever background tracking is on. Fires enter/exit from the OS
  regardless of parked/doze/no-fix. Reuses the `GeofencingClient` wiring already in
  `LocationService`.
- **Secondary — live-fix detector.** The existing `processGeofences` crossing loop,
  trimmed to *only* detect a crossing and call the store. Backstop for when OS
  geofencing is unavailable/flaky.

### 2. Crossing store (`crossingStore`, JS)

- `recordCrossing(locationId, type, coords, timeIso)` — dedups (same `location_id` +
  `event_type` within `DEDUP_WINDOW_MS` = 60_000 → ignored) and writes to
  `geofence_events`.
- `getCrossingsForDay(dayId)` — ordered crossings for a day (new reader).
- This is the decoupling seam: producers write facts; the consumer never reads live
  tracking state.

### 3. Inference (`endOfDay.ts`, rewritten — pure, no live state)

Folds a day's crossings into start/end + optional confirmation. All work locations
collapse into one "at work" state (so hopping between the two offices is invisible).

- **Start:** `started_at` = first work arrival of the day; set only when empty.
- **End:** a work departure opens a *pending end* stamped at the departure time.
  It resolves when:

  | Resolver | Commit | Ask? |
  |---|---|---|
  | Arrive **home** | end = the work-departure time | No — silent auto-fill (editable) |
  | Re-enter **any work** before it resolves | cancel pending (stepped out / office switch; out-of-office counted as work) | — |
  | **Away > 1 h**, no home, no work re-entry | end = the work-departure time | **Yes** — "Did you leave work at hh:mm?" |

- No separate cooldown constant: "not switching offices" falls out of
  "work re-entry cancels the pending end." Commute home is never counted.
- **Constants:** `AWAY_THRESHOLD_MS` = 3_600_000 (1 h). Old "on-time ±30 min
  auto-commit" special case is **dropped** — home + 1 h rules cover it more simply.
- **Idempotent & re-runnable:** same crossings → same result. Runs on each crossing,
  on app-foreground, and on tracking-start; all agree.
- Never overwrites a value whose source is `'manual'`.

### 4. Orchestrator (`dayDetection`, JS)

- Subscribes to `onGeofenceCrossing`; persists via `crossingStore`; runs inference.
- Re-runs inference on app-foreground and tracking-start (resolves the 1 h-away
  branch without a live tick).
- Registers monitored places (native `monitorPlaces`) on tracking-start and whenever
  saved locations change.

## Data model

- **`days`:** add `started_at_source TEXT` and `ended_at_source TEXT`
  (`'auto'` | `'manual'` | null). Inference writes `'auto'` and only ever touches
  `'auto'`/empty values; manual edits (DaySummaryCard) write `'manual'`. Lets the day
  view label auto-detected vs user-entered. Migration bumps schema version.
  `started_at_2`/`ended_at_2` unchanged (manual leg 2).
- **`geofence_events`:** repurposed as the crossing store (add the reader; no column
  change needed).
- **`day_end_confirmations`:** unchanged.

## Native changes (`LocationService.kt` + receiver)

- `monitorPlaces(places: [{id, lat, lon, radius, kind}])` bridge method — registers
  OS geofences (ENTER + EXIT) for all work + home places, radius =
  `max(radius_m, MIN_OS_RADIUS_M ≈ 100)` for OS reliability, on a dedicated
  PendingIntent. Re-callable to update the set.
- `GeofenceCrossingReceiver` — on transition, emits `onGeofenceCrossing`
  `{locationId, type: 'enter'|'exit', latitude, longitude, timestamp}` to JS via the
  `reactHost.currentReactContext.emitDeviceEvent` path (New Arch: reactHost, not
  reactNativeHost — see prior gotcha).
- The existing parked-exit wake keeps its own separate PendingIntent/receiver —
  untouched. Two geofence registrations coexist (GeofencingClient supports it).

## Power-ladder touch (one, deliberate)

`canPark` drops its `_eod.pendingExit === null` term → `_nativeActive &&
<insideSavedPlace>`. That term only kept live ticks flowing for end detection, which
no longer needs them (a home-arrival OS geofence resolves the end even while parked).
Net: less coupling. The "currently inside a saved place" signal the ladder needs for
parked-fencing is retained (derived from current crossing/membership state).

## Removals

- All end-of-day logic out of `handlePosition`/`processGeofences`: the inline
  `started_at` fill, the `applyEndOfDay` calls, the `tick` coupling, and the
  `_eod`/`_eodDay` module state in `gpsService`.
- `processGeofences` reduces to the secondary crossing producer (detect +
  `recordCrossing`).

## DayView live label

`getCurrentGeofenceDetection()` (used by DayView for the "you're at work" label) is
reimplemented to derive current membership from the latest crossing per location
today, instead of the in-memory `_insideIds` tied to the old live loop. Signature
unchanged; DayView untouched.

## Error handling

- Geofence registration failure (no Play Services / permission) → logged via `diag`;
  the live-fix producer still catches crossings while moving. Best-effort, never
  crashes tracking.
- 3 places, far under the 100-geofence OS limit.
- Dedup prevents double-counting when both producers fire for the same crossing.

## Testing

- **Pure inference (primary value):** unit tests over synthetic crossing sequences —
  start-fill; home-commit (silent); work-reentry cancels pending; away->1 h commit +
  confirm; manual value never overwritten; two-office switch stays "at work"; empty
  day (no work) → no start/end.
- **Dedup:** small unit test on `recordCrossing`.
- **Device:** capture a real work day on-device (backup + diag log) — the final proof.
  Expect `onGeofenceCrossing` enter at work → `started_at` auto; leave work → home →
  `ended_at` auto silent; an errand-without-home day → the confirmation appears.
