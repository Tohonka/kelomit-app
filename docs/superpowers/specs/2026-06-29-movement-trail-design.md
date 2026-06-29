# Iteration 5.5 — Movement trail + 7-day retention (design)

**Date:** 2026-06-29
**Status:** approved (Tommi, 2026-06-29)

## Goal

A faithful workday **movement trail** — "where have I been" — recorded continuously
while tracking is on, instead of coarse 20 m hops between stops. Raw points are
**retained for 7 days** so a day's route can be re-plotted later even after the user
edits their hours. The design is **error-correctable by intent**: recording is never
gated by work hours, so no data is lost to a mistake — the retention window is the
"unsend the email" safety net.

Framing: GPS in Kelomit is a **test-bed for a future fleet-management app**
(see auto-memory `kelomit-tracking-intent-fleet`). Decisions weigh battery, privacy,
and fidelity, not just "easiest for Kelomit." Immediacy is **not** required; batched
writes are fine.

## Scope (settled with user)

In scope: **movement trail** (denser recording + stationary-jitter gate) and the
**7-day retention/prune**.

Explicitly **out** of scope this iteration: on-the-move activity-recognition native
dep, work-hours recording limit, per-day "stop tracking for today" control,
polyline simplification. (Rationale below.)

## Design

### 1. Denser recording
- In `src/services/gpsService.ts`, lower the watch `distanceFilter` from `20` → `10` m,
  as a named const `TRAIL_DISTANCE_FILTER_M` with an explanatory comment.
- No interval change; no new user setting (density tuning, not user config — YAGNI
  until the user asks).

### 2. Stationary-jitter gate (cheap, JS-only)
The real problem a 10 m filter introduces: when the user stands still, the fused fix
**drifts** several metres and can cross 10 m, logging fake movement. A zero-cost JS
gate rejects that using fields already recorded.

- New pure function in `src/services/locationUtils.ts`, beside `isOutlier`:
  `isStationaryJitter(prev, lat, lon, accuracy, speed): boolean`.
- Returns true (→ skip the **trail DB write**) when the device reports ~no speed
  **and** the displacement is within plausible accuracy noise.
- Compared against the **last recorded** point (not the last *seen* point) so slow
  drift cannot accumulate into a phantom trail; when real movement resumes, speed
  rises and/or distance from the last recorded point is large → the point records.
- Calibration knobs as named constants (the physical world needs tuning a minimal
  model can't see):
  - `STILL_SPEED_MS` ≈ 0.5 (m/s below which the device is treated as stationary),
  - jitter floor ≈ 8 m (minimum noise even when reported accuracy is optimistic),
  - `JITTER_K` ≈ 1.5 (multiple of accuracy treated as noise).
  Exact values are tunable on device; start with these.

### 3. Integration in `handlePosition` (`gpsService.ts`)
- Outlier rejection (`isOutlier`) and geofence detection (`processGeofences`,
  day start/end inference) continue to run on **every accepted fix** — responsiveness
  of day start/end must not regress.
- Only the `insertGpsPoint` trail write is gated by `isStationaryJitter`.
- `gpsService` keeps a new module-level `_lastRecordedPosition` (lat/lon/accuracy),
  updated only when a point is actually written, for the gate comparison.

### 4. 7-day retention
- New `pruneGpsTracksOlderThan(days = 7)` in `src/db/gps.ts`:
  `DELETE FROM gps_track WHERE timestamp < ?` with cutoff = (now − 7 days) as an ISO
  string (ISO timestamps compare lexicographically, so this is correct).
- Called once at startup in `App.tsx`'s `initDB().then(...)` block (best-effort,
  never blocks boot).
- `7` is hardcoded for now; becomes user-configurable in a later iteration (YAGNI).
- **Only the raw dense trail is transient.** Day records, notes, geofence events,
  and start/end times persist forever — they are not touched by the prune.

### 5. Re-plot when hours change — nothing to build
`DayMapScreen` already plots the **whole** day's `gps_track` (never clipped to work
hours), and recording is never gated by hours. So editing hours later re-derives the
trail view automatically from the retained points. No code needed beyond retention.

## Reuse
- `distanceMeters` (locationUtils), existing outlier path, `DayMapScreen` / map
  components, `insertGpsPoint` / `getGpsPointsForDay`.

## Native impact
- **None.** No new native dependency → **Metro reload only, no rebuild/sideload.**

## Testing
- TDD the pure utils: `isStationaryJitter` (stationary-drift rejected; real movement
  kept; null-speed handling) and the prune cutoff calculation.
- Battery and real-world trail fidelity are **device-soak only** — Jest can't judge them.

## Deferred (with rationale)
- **Activity-recognition native dep** (`react-native-activity-recognition`): would save
  battery by gating on walking/driving, but adds a native module → rebuild + sideload
  + new runtime permission. Deferred; continuous recording + the JS jitter gate is the
  lazier path for now. Revisit as the fleet-app battery question matures.
- **Work-hours recording limit:** intentionally NOT built — gating recording by hours
  would defeat the error-correction intent. Display/hours can be re-derived from the
  full retained trail instead.
- **Per-day "stop tracking for today" control:** natural companion to the on/off
  concept the user described, but not selected for this iteration. Today recording is
  governed by the global `gps_enabled` toggle.
- **Polyline simplification (e.g. Douglas–Peucker):** denser recording may produce many
  points per day. Add a TDD'd simplification util only if the map measurably lags on
  device; leave a `ponytail:` marker at the render site. Not built pre-emptively.
