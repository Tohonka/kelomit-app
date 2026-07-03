# Iteration 5.8 — Resilient dual-source tracking (design)

**Date:** 2026-07-01
**Status:** approved (Tommi, 2026-07-01)

## Problem

Iteration 5.7 replaced the JS `watchPosition` with native foreground-service location
(either/or by `background_tracking`). On device it regressed hard: day 1992 (5.7 build)
logged **13 points** vs day 1075 (pre-5.7) **563 points**. The 13 points all fall in
foreground moments — the native FGS starts briefly then dies when backgrounded, so with
the JS watch removed there is no fallback and tracking collapses. The FGS-death root
cause needs device `logcat` (targetSdk 36 / Android 14+ FGS rules, OEM battery-kill, or
a service exception) and is **deferred** to when the cable is available.

## Goal

Make tracking **never worse than the pre-5.7 build**, while still gaining the native
Doze-resistant coverage *when it works* — by running the JS watch as an always-on
baseline and layering the native FGS on as an additional source.

## Design

### Dual source (replaces 5.7's XOR)
- The **JS `watchPosition`** runs whenever tracking is on — foreground and background —
  exactly as the working pre-5.7 build (which got 563 pts/day). This is the baseline.
- The **native FGS** (5.7) runs *additionally* when `background_tracking` is on and the
  native module is available — an enhancement, not a replacement.
- Both sources feed the single existing `handlePosition` pipeline.

### gpsService seam
- `startTracking(intervalMs)`: always `armWatch(FAST_INTERVAL_MS)` (JS). Then, if
  `background_tracking` && `isBackgroundLocationAvailable()`: also
  `subscribeBackgroundLocation(handleNativeFix)` + `startBackgroundLocationService()` and
  set `_nativeActive = true`.
- Adaptive mode change in `handlePosition`: `armWatch(ms)` always; **and**
  `if (_nativeActive) setBackgroundInterval(ms)`. One `desiredMode` drives both sources.
- `stopTracking`: clear the JS watch; if `_nativeActive`, remove the native listener +
  `stopBackgroundLocationService()`. Reset all state (`_active`, `_nativeActive`,
  `_lastPosition`, `_lastRecordedPosition`, `_trackingMode`, `_stationaryStreak`,
  `_lastAcceptedFixMs`).

### Dedup gate (new)
At the very top of `handlePosition`, drop a fix if the previous *accepted* fix arrived
less than `MIN_FIX_GAP_MS` (≈ 2000 ms, wall-clock via `Date.now()`) ago:
- Pure helper `isDuplicateFix(nowMs, lastAcceptedMs, minGapMs = MIN_FIX_GAP_MS): boolean`.
- On a non-duplicate fix, record `_lastAcceptedFixMs = Date.now()` before processing.
- Both sources run at ~4 s (FAST) / 60 s (SLOW), so a 2 s gate collapses overlapping
  fixes to one effective stream (no double points, no double geofence) but never drops a
  legitimate single-source fix (gaps ≥ 4 s ≫ 2 s). When native is dead, only the JS
  source fires and the gate never triggers — baseline preserved.
- Placed above outlier/adaptive/jitter so a duplicate skips the whole pipeline
  (including geofence — the other source's fix in that slot already ran it).

### Guarantee
JS watch runs identically to the working build → never worse than before. Native adds
background coverage when the FGS is alive; when it dies, the JS baseline carries on.

### Battery
Running both sources is more drain than one; the adaptive 60 s slow-mode while stationary
blunts it. Accepted for now — reliability is the priority. Once `logcat` lets us make the
native FGS trustworthy, native can return to primary (JS demoted to fallback-only).

## Testing
- TDD `isDuplicateFix` (duplicate within gap → true; outside gap → false; first fix with
  `lastAcceptedMs = 0`/null → false).
- The dual-source seam and battery are device-verified; `npm run check` covers the JS.

## Out of scope / deferred
- Root-causing the native FGS death — needs device `logcat` (deferred, cable pending).
- Start/stop-tracking home-screen widget — the "fallback for fallback"; its own spec next,
  mirroring the existing Phase 9.2 `SessionToggleWidgetProvider`.
- Requesting `POST_NOTIFICATIONS` at background-tracking enable time (found during debug:
  currently only requested on todo-reminder) — fold into the widget or a small follow-up.
