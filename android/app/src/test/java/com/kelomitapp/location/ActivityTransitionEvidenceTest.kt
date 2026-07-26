package com.kelomitapp.location

import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.DetectedActivity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ActivityTransitionEvidenceTest {
  @Test
  fun supportsBothDirectionsForEveryTrackedActivity() {
    assertEquals(
      listOf(
        DetectedActivity.STILL,
        DetectedActivity.WALKING,
        DetectedActivity.RUNNING,
        DetectedActivity.ON_FOOT,
        DetectedActivity.ON_BICYCLE,
        DetectedActivity.IN_VEHICLE,
      ),
      TRACKED_ACTIVITY_TYPES,
    )
    assertEquals(
      listOf(
        ActivityTransition.ACTIVITY_TRANSITION_ENTER,
        ActivityTransition.ACTIVITY_TRANSITION_EXIT,
      ),
      TRACKED_TRANSITION_TYPES,
    )
  }

  @Test
  fun mapsSupportedValuesAndRejectsUnknownValues() {
    assertEquals("vehicle", activityName(DetectedActivity.IN_VEHICLE))
    assertEquals("walking", activityName(DetectedActivity.WALKING))
    assertEquals(
      "enter",
      transitionName(ActivityTransition.ACTIVITY_TRANSITION_ENTER),
    )
    assertEquals(
      "exit",
      transitionName(ActivityTransition.ACTIVITY_TRANSITION_EXIT),
    )
    assertNull(activityName(DetectedActivity.UNKNOWN))
    assertNull(transitionName(99))
  }

  @Test
  fun reconstructsBatchedEventWallClockTime() {
    assertEquals(
      1_700_000_008_000L,
      transitionWallTimeMs(
        eventElapsedNs = 18_000_000_000L,
        nowElapsedNs = 20_000_000_000L,
        nowWallMs = 1_700_000_010_000L,
      ),
    )
  }
}
