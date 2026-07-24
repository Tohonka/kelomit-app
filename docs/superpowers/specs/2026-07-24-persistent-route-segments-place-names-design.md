# Persistent route segments and historical place names

**Date:** 2026-07-24
**Status:** approved in chat; awaiting written-spec review

## Problem

The day map currently draws every accepted GPS point as one polyline. A full
day therefore becomes one visually ambiguous route, including stationary GPS
noise inside places. The existing five-minute dwell clustering is used only
for the location list.

Unknown-stop names are also unstable. Google Places returns only its nearest
candidate, the result is cached by coordinate cell, and the selected name is
not attached to the historical day. Users cannot choose another nearby result
or give the physical place a reusable private name.

Raw `gps_track` rows are currently pruned after seven days. That makes older
route geometry and future drive-time analysis disappear entirely.

## Goals

- Split a day into meaningful trips between saved places, reusable named
  places, and five-minute unnamed stops.
- Draw consecutive trips with a rotating accessible color palette.
- Preserve compact route geometry, times, stop names, and summary statistics
  indefinitely with the day.
- Keep correction-grade raw GPS points for 45 days.
- Store Google-resolved names as historical day snapshots.
- Let users choose among nearby places or create a lightweight reusable name.
- Keep reusable names completely separate from Home/Work geofences and
  workday detection.
- Preserve current native Android tracking ownership and its verified behavior.

## Non-goals

- Inferring transport mode or drawing speed-based dots/dashes in this release.
- Uploading or synchronizing GPS data.
- Turning reusable map names into native geofences.
- Reconstructing routes for old days whose raw points were already pruned.
- Changing GPS accuracy, jitter filtering, or adaptive sampling.

## Ownership

Native Android remains the sole owner of background location requests,
movement wakeups, and saved-location geofence monitoring. It continues to
buffer fixes while React is unavailable.

JavaScript owns derived route history after fixes reach SQLite. This avoids a
second route/place implementation in Kotlin:

1. Accepted fixes continue through `persistFix()` into `gps_track`.
2. A debounced refresh derives the active day's stops and segments while JS is
   alive.
3. A completed native-buffer import refreshes every affected day once.
4. App startup and map focus compare the newest raw timestamp with the derived
   state and rebuild only stale days.
5. A map reads persisted stops/segments first; it does not require live
   geocoding or recomputation to show historical data.

Derived state may lag while JS is dead, but raw native-buffered fixes remain
durable and are reconciled the next time JS becomes available.

## Segmentation rules

Process a day's accepted GPS points in timestamp order. Existing record-time
accuracy and jitter filtering remains authoritative; the segmenter does not
re-admit rejected fixes.

### Known anchors

Saved locations and lightweight reusable places are route anchors.

- Entering an anchor ends the incoming segment at the first inside point.
- Points while inside the anchor are omitted from route geometry.
- Leaving begins the outgoing segment at the first outside point.
- A short stop still splits the route. For example, Office → Training yard,
  three minutes collecting keys, then Training yard → Office produces two
  segments.
- If radii overlap, use the nearest containing anchor.
- Entry uses the configured radius. Exit uses the existing 1.25 hysteresis
  multiplier so perimeter noise cannot create rapid tiny segments.

Saved locations use their configured `radius_m`. Reusable places use a stored
radius with a 70 m default. This radius affects retrospective route
segmentation only.

### Unnamed stops

Outside known anchors, reuse the existing greedy dwell-cluster model:

- A point remains in the current tentative cluster while it stays within 70 m
  of the running centroid.
- A cluster becomes a stop after spanning at least 300 seconds.
- Traffic lights and other shorter pauses remain part of the trip.
- Once a stop qualifies, the incoming trip ends at the first point in the
  cluster—not five minutes late—and the outgoing trip starts at the first point
  that leaves the cluster.

### Partial days and gaps

- A route fragment with at least two movement points may have a missing origin
  or destination stop. The legend labels these endpoints “Day start” and
  “Day end.”
- A GPS time gap alone does not create a stop or segment boundary.
- Implausible or incomplete data produces fewer segments; the app does not
  invent travel.
- Segmentation is day-scoped. Midnight closes the current day's final fragment
  and the next day begins a new one.

## Persistent data

### `named_places`

Lightweight reusable map identity:

- `id`
- `name` (trimmed, non-empty)
- `latitude`, `longitude`
- `radius_m` (default 70)
- `created_at`, `updated_at`

It has no `kind`, no native synchronization, and no effect on work detection.

### `day_route_stops`

Permanent historical stop snapshot:

- `id`, `day_id`
- `start_ts`, `end_ts`
- centroid `latitude`, `longitude`
- nullable `saved_location_id`
- nullable `named_place_id`
- nullable `google_place_id`
- `display_name`
- `name_source`: `saved`, `reusable`, `google`, `day`, or `unknown`
- `user_edited`
- `created_at`, `updated_at`

The stored display name is authoritative for that day. Later Google changes or
renaming a reusable place do not alter existing rows.

### `day_route_segments`

Permanent compact trip:

- `id`, `day_id`, chronological `sequence`
- `start_ts`, `end_ts`
- nullable `origin_stop_id`, `destination_stop_id`
- `coordinates_json`: map geometry containing latitude/longitude only
- `distance_m`, `duration_sec`
- `average_speed_mps`, `maximum_speed_mps`
- `raw_last_ts`
- `created_at`, `updated_at`

The geometry intentionally omits accuracy, altitude, speed samples, and
per-point timestamps. Those remain in raw GPS for 45 days; the permanent row
keeps what the historical map and future trip summaries need.

### Google candidate cache

Extend `place_cache` with a nullable `candidates_json` value. A lookup requests
up to ten Google candidates within the nearby search radius, including
display name, stable place ID, and coordinate. Results are sorted locally by
distance. Existing cached name/place-ID rows remain valid for automatic
naming. Because they have no candidate list, opening the correction sheet
fetches and stores nearby candidates once.

Authentication, quota, or network failures are not cached as successful empty
candidate lists.

## Rebuild and snapshot preservation

Rebuilding a day recalculates stop timing, centroids, segment geometry, and
statistics from raw points. Before replacing derived rows, it matches newly
derived stops to existing stops by overlapping time and proximity.

For a matched stop:

- preserve `display_name`, `name_source`, Google ID, reusable-place link, and
  `user_edited` when the old row has an explicit user choice;
- allow timing and centroid fields to update;
- update segment references to the retained stop.

Rebuilds preserve every existing non-empty `display_name`, including automatic
Google snapshots. A lookup fills only a new or unnamed stop; it never silently
replaces an existing result.

Existing raw days are backfilled lazily when opened or encountered by startup
reconciliation. No bulk Google lookup runs during migration.

## Naming precedence and interactions

The displayed name precedence is:

1. Explicit choice for this day.
2. Saved or reusable place matched when the stop was derived.
3. Google's nearest cached candidate.
4. Localized “Unknown.”

Every displayed result is copied into `day_route_stops.display_name`; rendering
never follows a mutable Google or reusable-place name by reference.

The map overview keeps its Places section. Each place row becomes a button.
Tapping the name opens a plain React Native sheet:

1. Saved and reusable local places in the area, labeled by type and distance.
2. Cached or freshly loaded Google candidates, sorted by distance.
3. “Name this place…”

Choosing any row changes only the current day's stop. Segment
origin/destination labels read from that stop, so the trip legend updates
without changing geometry.

“Name this place…” asks for a non-empty name, creates a `named_places` row at
the stop centroid, and applies it to the selected stop. Future matching visits
use that reusable name. Renaming the reusable place later affects future
visits only.

If Google is unavailable, the sheet still shows local choices and the naming
action. Failure leaves the current historical snapshot untouched.

## Map presentation

Replace the single `routeCoords` polyline with persisted route segments.

- Cycle a fixed, accessible palette by chronological segment.
- Use the same color swatch in a Trips section below the map.
- Each trip row shows `Origin → Destination`, local start/end time, distance,
  and duration.
- Trip rows are read-only in this release; no new detail screen is required.
- Keep existing note markers and the full-screen map.
- Overall day distance and duration become sums of trip segments, excluding
  stationary dwell.
- Keep start/end markers only for the first and last movement points of the
  day, avoiding markers at every stop.

## Retention, privacy, and backup

- Change `pruneGpsTracksOlderThan()` from seven to 45 days.
- Continue pruning only dense `gps_track` rows.
- `named_places`, `day_route_stops`, and `day_route_segments` persist until the
  associated day is deleted.
- Existing foreign-key cascades remove derived rows with their day. Deleting a
  reusable place sets historical links to null but leaves frozen stop names.
- The existing full SQLite backup/restore includes all new tables and the
  current 45-day raw window automatically.
- No GPS or naming data leaves the device except coordinates sent to Google
  when an unresolved stop is looked up under the existing Places permission
  model.

## Migration

Add one schema migration that:

1. Creates `named_places`, `day_route_stops`, and `day_route_segments`.
2. Adds indexes for day/sequence, day/time, and foreign-key lookups.
3. Adds `place_cache.candidates_json`.
4. Leaves existing `gps_track`, locations, and cached names intact.

There is no eager data backfill. The first reconciliation of an eligible day
creates its permanent summaries from available raw points.

## Error handling

- Derived writes for one day run in a transaction so stops and segment
  references cannot become partially updated.
- Failure to derive or persist a day leaves its previous summaries intact and
  can retry on the next reconciliation.
- Google failure never deletes or replaces a snapshot.
- Invalid candidate payloads are ignored; a valid subset still appears.
- Empty reusable names are rejected in the sheet before the database call.
- A corrupted segment geometry row is skipped rather than crashing the map;
  an eligible raw day is marked for rebuild.

## Testing and verification

### Pure Jest tests

- Known-place entry splits immediately, including a three-minute stop.
- Unknown pause below five minutes does not split.
- Unknown pause at five minutes splits at the cluster's first point.
- Hysteresis suppresses perimeter flapping.
- Overlapping anchor radii select the nearest anchor.
- Return travel over the same road produces two ordered segments.
- Gaps alone do not split a trip.
- Distance, duration, average speed, and maximum speed are correct.
- Partial-day endpoint labels are correct.

### Database/service tests

- Migration creates the new schema without changing existing data.
- Reconciliation is transactional and stale-day detection uses `raw_last_ts`.
- Rebuild preserves explicit day names and frozen automatic snapshots.
- Reusable-place rename affects future derived stops only.
- Candidate precedence, invalid payloads, and network failure are safe.
- Raw retention uses a 45-day cutoff.
- Day deletion cascades summaries; reusable-place deletion preserves names.
- Backup/restore includes summaries, reusable names, and raw-window data.

### UI and device verification

- Map renders multiple colored Android polylines and a matching trip legend.
- Known three-minute pickup displays as two trips.
- Selecting another candidate updates only the viewed day.
- “Name this place” applies immediately and matches a later visit.
- Renaming it does not alter the earlier day.
- Offline correction still offers local choices and manual naming.
- Past maps render from summaries after raw points are removed.
- Existing native GPS tracking, saved-place work detection, note markers, and
  full-screen map remain functional.

## Deferred speed styling

Do not classify running, bicycle/scooter, or vehicle segments yet. Maximum GPS
speed can spike, and mixed-mode segments need a better rule than a single
threshold. Permanent average and maximum speed fields retain the evidence
needed for a later visual treatment without keeping raw points forever.
