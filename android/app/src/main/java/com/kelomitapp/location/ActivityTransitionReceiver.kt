package com.kelomitapp.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
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
        wakeTracking(context)
      }
      return
    }
    if (ActivityRecognitionResult.hasResult(intent)) {
      val result = ActivityRecognitionResult.extractResult(intent) ?: return
      val top = result.mostProbableActivity
      if (top.type in MOVING_TYPES && top.confidence >= MIN_CONFIDENCE) {
        Log.d("KelomitLoc", "activity-sample wake type=${top.type} conf=${top.confidence}")
        wakeTracking(context)
      }
    }
  }

  private fun wakeTracking(context: Context) {
    val settings = NativeTrackingSettings(context)
    if (!settings.enabled) return
    val now = System.currentTimeMillis()
    settings.movingUntilMs = now + TrackingPolicy.MOVING_LEASE_MS
    val live = LocationService.instance
    if (live != null) {
      live.onActivityMoveWake(now)
      return
    }
    try {
      val intent = Intent(context, LocationService::class.java)
        .putExtra(LocationService.EXTRA_SLOW_INTERVAL, settings.slowIntervalMs)
      ContextCompat.startForegroundService(context, intent)
    } catch (error: Exception) {
      // The persisted lease is retained for the next system/permitted start.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        error is android.app.ForegroundServiceStartNotAllowedException
      ) {
        DiagLog.write(context, "wake.activity.defer", error.javaClass.simpleName)
      } else {
        DiagLog.write(context, "wake.activity.fail", error.javaClass.simpleName)
      }
    }
  }
}
