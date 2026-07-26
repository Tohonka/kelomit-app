package com.kelomitapp.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity

internal val TRACKED_ACTIVITY_TYPES = listOf(
  DetectedActivity.STILL,
  DetectedActivity.WALKING,
  DetectedActivity.RUNNING,
  DetectedActivity.ON_FOOT,
  DetectedActivity.ON_BICYCLE,
  DetectedActivity.IN_VEHICLE,
)

internal val TRACKED_TRANSITION_TYPES = listOf(
  ActivityTransition.ACTIVITY_TRANSITION_ENTER,
  ActivityTransition.ACTIVITY_TRANSITION_EXIT,
)

internal fun activityName(type: Int): String? = when (type) {
  DetectedActivity.STILL -> "still"
  DetectedActivity.WALKING -> "walking"
  DetectedActivity.RUNNING -> "running"
  DetectedActivity.ON_FOOT -> "on_foot"
  DetectedActivity.ON_BICYCLE -> "bicycle"
  DetectedActivity.IN_VEHICLE -> "vehicle"
  else -> null
}

internal fun transitionName(type: Int): String? = when (type) {
  ActivityTransition.ACTIVITY_TRANSITION_ENTER -> "enter"
  ActivityTransition.ACTIVITY_TRANSITION_EXIT -> "exit"
  else -> null
}

internal fun transitionWallTimeMs(
  eventElapsedNs: Long,
  nowElapsedNs: Long,
  nowWallMs: Long,
): Long = nowWallMs - maxOf(0L, nowElapsedNs - eventElapsedNs) / 1_000_000L

/**
 * Wakes the [LocationService] the moment the OS activity-recognition engine
 * reports the user is moving (walking/cycling/vehicle). Two delivery paths land
 * here:
 *  - TRANSITION events (registered for the service lifetime): every supported
 *    ENTER/EXIT is journaled as durable route-derivation evidence; moving ENTER
 *    events also wake fast tracking.
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
      val nowElapsedNs = SystemClock.elapsedRealtimeNanos()
      val nowWallMs = System.currentTimeMillis()
      val journal = NativeEventJournal(context)
      var startedMoving = false
      result.transitionEvents
        .sortedBy { it.elapsedRealTimeNanos }
        .forEach { event ->
        val activity = activityName(event.activityType) ?: return@forEach
        val transition = transitionName(event.transitionType) ?: return@forEach
        journal.append(
          "activity",
          mapOf(
            "activity" to activity,
            "transition" to transition,
            "timestamp" to transitionWallTimeMs(
              event.elapsedRealTimeNanos,
              nowElapsedNs,
              nowWallMs,
            ),
          ),
        )
        if (
          event.transitionType == ActivityTransition.ACTIVITY_TRANSITION_ENTER &&
          event.activityType in MOVING_TYPES
        ) {
          startedMoving = true
        }
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
