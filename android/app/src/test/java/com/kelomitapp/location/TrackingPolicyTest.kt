package com.kelomitapp.location

import org.junit.Assert.assertEquals
import org.junit.Test

class TrackingPolicyTest {
  @Test
  fun activityWakeEntersFastAndStartsLease() {
    val out = TrackingPolicy.reduce(
      TrackingPolicy.State(mode = TrackingPolicy.Mode.IDLE),
      TrackingPolicy.Signal.Moving(nowMs = 10_000L),
    )

    assertEquals(TrackingPolicy.Mode.FAST, out.mode)
    assertEquals(130_000L, out.movingUntilMs)
  }

  @Test
  fun staleStillFixCannotUndoMovementLease() {
    val moving = TrackingPolicy.State(
      mode = TrackingPolicy.Mode.FAST,
      movingUntilMs = 130_000L,
      stillFixes = 99,
    )

    val out = TrackingPolicy.reduce(
      moving,
      TrackingPolicy.Signal.StillFix(nowMs = 10_050L),
    )

    assertEquals(TrackingPolicy.Mode.FAST, out.mode)
    assertEquals(0, out.stillFixes)
  }

  @Test
  fun slowWalkSampleRenewsLeaseBelowGpsSpeedThreshold() {
    val out = TrackingPolicy.reduce(
      TrackingPolicy.State(mode = TrackingPolicy.Mode.SLOW),
      TrackingPolicy.Signal.Moving(nowMs = 200_000L),
    )

    assertEquals(TrackingPolicy.Mode.FAST, out.mode)
    assertEquals(320_000L, out.movingUntilMs)
  }

  @Test
  fun stationaryEvidenceEventuallyIdlesWithoutGeofenceInput() {
    var state = TrackingPolicy.State(mode = TrackingPolicy.Mode.FAST)
    repeat(TrackingPolicy.STILL_FIXES_TO_SLOW) {
      state = TrackingPolicy.reduce(state, TrackingPolicy.Signal.StillFix(500_000L))
    }
    assertEquals(TrackingPolicy.Mode.SLOW, state.mode)

    repeat(TrackingPolicy.STILL_FIXES_TO_IDLE) {
      state = TrackingPolicy.reduce(state, TrackingPolicy.Signal.StillFix(700_000L))
    }
    assertEquals(TrackingPolicy.Mode.IDLE, state.mode)
  }

  @Test
  fun speedTierUsesExistingHysteresis() {
    var state = TrackingPolicy.State(
      mode = TrackingPolicy.Mode.FAST,
      intervalMs = 4_000L,
    )

    state = TrackingPolicy.reduce(state, TrackingPolicy.Signal.MovingFix(3.5f, 1L))
    assertEquals(2_000L, state.intervalMs)

    state = TrackingPolicy.reduce(state, TrackingPolicy.Signal.MovingFix(2.5f, 2L))
    assertEquals(2_000L, state.intervalMs)

    state = TrackingPolicy.reduce(state, TrackingPolicy.Signal.MovingFix(2.4f, 3L))
    assertEquals(4_000L, state.intervalMs)
  }
}
