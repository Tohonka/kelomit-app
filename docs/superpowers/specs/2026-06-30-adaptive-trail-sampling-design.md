# Iteration 5.6 — Adaptive movement-trail sampling (design)

**Date:** 2026-06-30
**Status:** approved (Tommi, 2026-06-30)

## Problem

The day route trail "takes shortcuts": long straight diagonals that cut street
corners instead of following the road. Root cause (confirmed by device soak +
code): the location watch `interval` is **60 s** (`gps_interval_ms` default, passed
straight to `watchPosition`). With background tracking on, the tracker runs all day
but only computes ~1 fix/minute — at driving speed that's a point every few hundred
metres, so the polyline straight-lines between them. Iteration 5.5 lowered the
`distanceFilter` to 10 m but the 60 s time clock gates first, so it never helped on
the move. The stationary-jitter gate is not involved (it only drops near-stationary
points).

## Goal

A dense, street-following trail while moving, without draining the battery by
high-rate GPS all day. This is the JS-only "user is on the move" detection
([[kelomit-tracking-intent-fleet]]): sample fast while moving, slow while still.

## Approach (chosen)

JS adaptive interval — no native dependency (Metro reload only). The fused `speed`
field already present in each fix drives a two-state machine; native
activity-recognition stays deferred (rebuild + sideload).

## Design

### Detection (pure, testable)
- `isMoving(speed, displacementM, elapsedMs): boolean` — true when the device is
  moving. Uses the fused `speed` (m/s) when present: `speed >= MOVE_SPEED_MS`.
  When `speed` is null, falls back to `displacementM / (elapsedMs/1000) >= MOVE_SPEED_MS`.
  `MOVE_SPEED_MS ≈ 1.0` (≈ 3.6 km/h).
- `nextTrackingMode(prevMode, movingNow, stationaryStreak): 'fast' | 'slow'`:
  - → `'fast'` immediately on any `movingNow` fix (no lag when tightening).
  - → `'slow'` only after `stationaryStreak >= STATIONARY_STREAK_TO_SLOW`
    consecutive non-moving fixes (hysteresis; prevents flapping at a stoplight).
  - otherwise unchanged.

### Intervals
- FAST (moving): `FAST_INTERVAL_MS = 4000`.
- SLOW (stationary): the existing `gps_interval_ms` setting (default 60000) — reused
  as the idle cadence, no new setting.
- `distanceFilter` stays 10 m.

### Re-arming (gpsService, device-only)
- `gpsService` holds `_trackingMode` and a `_stationaryStreak` counter.
- On each accepted fix: compute `movingNow` (via `isMoving`, comparing to the last
  seen fix), update the streak, compute the desired mode via `nextTrackingMode`.
- When the desired mode differs from `_trackingMode`: `clearWatch` then
  `watchPosition` with the new interval (FAST_INTERVAL_MS or the slow setting), and
  update `_trackingMode`. Same path for foreground and the background
  foreground-service watch.
- `startTracking` begins in FAST so a trip already in progress at app start records
  densely; `stopTracking` resets `_trackingMode`/streak.

### Tuning
All thresholds are named constants with a `ponytail:` device-tune comment:
`MOVE_SPEED_MS`, `STATIONARY_STREAK_TO_SLOW`, `FAST_INTERVAL_MS`. The physical
behaviour (provider update cadence, GPS speed accuracy) can only be judged on device.

### Known caveat — start-of-trip lag
While in SLOW, the first movement is noticed at the next slow fix (≤ the slow
interval, ~60 s). The 10 m `distanceFilter` may surface movement sooner, but this is
provider-dependent and not guaranteed. SLOW is therefore a knob: if the soak shows a
missed start-of-commute, lower the `gps_interval_ms` setting. Out of scope to solve
more cleverly without native activity-recognition.

## Unchanged (complementary)
- Stationary-jitter gate decides what to **store**; adaptive interval decides how
  often to **sample**.
- 7-day retention/prune; geofences + day start/end on every accepted fix.

## Testing
- TDD the pure functions `isMoving` and `nextTrackingMode` (speed-present, speed-null
  fallback, immediate-fast, hysteresis-to-slow).
- Re-arming, battery, and real trail fidelity are device-soak only.

## Out of scope
- Native activity recognition (`react-native-activity-recognition`) — deferred upgrade path.
- Per-day "stop tracking for today" control; work-hours recording limit.
