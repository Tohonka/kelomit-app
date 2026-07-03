# Iteration 5.9 — GPS power ladder (design)

**Date:** 2026-07-03
**Status:** approved (Tommi, 2026-07-03)

## Problem

5.8's dual-source tracking drains the battery. Evidence from the 2026-07-03 device
backup (`realUserData/kelomit-backup-20260703-1010/kelomit.db`): the user is stationary
inside Work/Home geofences for ~46 of every 48 hours (dt-gap analysis of `gps_track`),
yet during ALL of that time both sources — the JS `watchPosition` and the native FGS
fused client — keep running at `PRIORITY_HIGH_ACCURACY`, 60 s interval. High accuracy
indoors is the worst case: the GPS chip keeps hunting for a fix it can't get. Two
clients × ~22 h/day of pointless GPS duty-cycling is the bulk of the drain; the 4 s
moving bursts cover only ~1–2 h/day.

Secondary issue: the flat `FAST_INTERVAL_MS = 4000` cuts corners at scooter/bike speed
(25 km/h ⇒ a fix every ~28 m).

## Goal

Cut stationary-time battery cost to ~zero without losing trail fidelity or the
geofence-driven day start/end inference. Fix the fast-rate corner-cutting. Keep the 5.8
"never worse than pre-5.7" guarantee.

## Design

### Three-state ladder (replaces fast/slow)

`TrackingMode = 'fast' | 'slow' | 'parked'`

1. **FAST — moving.** Speed-tiered interval: `speed > SPRINT_SPEED_MS (3 m/s)` →
   `SPRINT_INTERVAL_MS (2000)`, else `FAST_INTERVAL_MS (4000)`. High accuracy, both
   sources, as today. The dedup window must scale: `MIN_FIX_GAP_MS` becomes
   ~`interval / 2` (1000 ms in sprint) so genuine 2 s fixes aren't swallowed as
   cross-source duplicates.
2. **SLOW — still, NOT inside a saved location.** 60 s (`gps_interval_ms`) as today,
   but **balanced power**: JS watch re-armed with `enableHighAccuracy: false`; native
   request built with `PRIORITY_BALANCED_POWER_ACCURACY`. No GPS chip while idle at a
   café; wifi/cell accuracy is enough to detect departure, and the existing
   `MAX_TRAIL_ACCURACY_M = 50` filter keeps low-quality fixes out of the trail.
3. **PARKED — still + inside a saved geofence (`_insideIds` non-empty), after
   `PARK_STREAK` (2) consecutive slow-mode still fixes (~2 min).** Clear the JS watch;
   `removeLocationUpdates` on the native client; **FGS stays alive but idle** (an idle
   process costs ~nothing and keeps the React context warm for the wake). Register a
   native `GeofencingClient` EXIT fence on the saved location(s) we're inside —
   `radius_m × 1.25` (matches the JS exit hysteresis). Notification text flips to a
   "paused at <place>" variant. On geofence exit: broadcast receiver → service restarts
   fused updates at FAST + emits fixes to JS as usual → JS sees movement, mode ladder
   takes over. Belt-and-braces: app foregrounding (AppState active) also exits parked
   and re-arms the JS watch.

### Scope guards

- **Parked requires background tracking ON** (FGS alive to receive the geofence wake).
  Foreground-only mode keeps today's fast/slow behavior — it only drains while the app
  is open.
- `GeofencingClient` comes from the **already-bundled** `play-services-location`
  artifact — zero new dependencies.
- Geofence *enter* logic, end-of-day inference, trail jitter/accuracy gates: untouched.
  Parked only starts while already inside a fence, and the exit wake delivers fixes
  right as the user leaves, so `processGeofences` still sees the exit crossing.

### Instrumentation (open item from 5.8 handoff)

- `Log.d("KelomitLoc", ...)` in `LocationService.emitLocation`.
- `console.log` in `handleNativeFix`.
- Purpose: a logcat captured **while driving** settles whether native background
  movement fixes reach JS/DB. Once confirmed, **demote JS watch to fallback-only**
  (native primary) as a tiny follow-up — that halves moving-time request load.

### Knobs (all `ponytail:` tune-on-device)

`SPRINT_SPEED_MS = 3.0`, `SPRINT_INTERVAL_MS = 2000`, `FAST_INTERVAL_MS = 4000`,
`PARK_STREAK = 2`, dedup gap = interval-scaled, slow = `gps_interval_ms` setting.

## Testing

- TDD the pure parts in `trackingMode.ts`: three-state `nextTrackingMode` (park entry
  needs slow + still-streak + inside-fence; any movement → fast), speed-tier selection,
  interval-scaled dedup gap.
- Native parts (geofence registration/wake, balanced-power request, idle-FGS parked
  state) are device-confirmed only. Rebuild + uninstall→reinstall
  ([[kelomit-sideload-gotcha]]).

## Deferred

- Activity recognition (new native dep) — parked state captures most of the win free.
- Ad-hoc geofences when still outside saved places (slow+balanced is cheap enough).
- Start/stop tracking home-screen widget — separate design.
- JS-demotion flip itself — gated on the drive logcat.
