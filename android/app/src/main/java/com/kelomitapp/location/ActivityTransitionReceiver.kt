package com.kelomitapp.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity

/**
 * Wakes the [LocationService] the moment the OS activity-recognition engine
 * reports the user is moving (walking/cycling/vehicle). Two delivery paths land
 * here:
 *  - TRANSITION events (registered for the service lifetime): we only register
 *    ENTER transitions for moving activities, so any event means "started moving".
 *  - Periodic SAMPLING results (registered only while in slow mode): the
 *    transition API can batch or miss gradual pace changes, so a confident
 *    moving sample is treated as the same wake.
 * If the service is gone there is nothing to wake — by design these signals
 * only exist while the FGS is alive.
 */
class ActivityTransitionReceiver : BroadcastReceiver() {
  companion object {
    private const val MIN_CONFIDENCE = 50
    private val MOVING_TYPES = setOf(
      DetectedActivity.WALKING,
      DetectedActivity.RUNNING,
      DetectedActivity.ON_FOOT,
      DetectedActivity.ON_BICYCLE,
      DetectedActivity.IN_VEHICLE,
    )
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (ActivityTransitionResult.hasResult(intent)) {
      val result = ActivityTransitionResult.extractResult(intent) ?: return
      val startedMoving = result.transitionEvents.any {
        it.transitionType == ActivityTransition.ACTIVITY_TRANSITION_ENTER
      }
      if (startedMoving) {
        Log.d("KelomitLoc", "activity-transition wake")
        LocationService.instance?.onActivityMoveWake()
      }
      return
    }
    if (ActivityRecognitionResult.hasResult(intent)) {
      val result = ActivityRecognitionResult.extractResult(intent) ?: return
      val top = result.mostProbableActivity
      if (top.type in MOVING_TYPES && top.confidence >= MIN_CONFIDENCE) {
        Log.d("KelomitLoc", "activity-sample wake type=${top.type} conf=${top.confidence}")
        LocationService.instance?.onActivityMoveWake()
      }
    }
  }
}
