package com.kelomitapp.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionResult

/**
 * Wakes the parked [LocationService] the moment the OS activity-recognition
 * engine reports the user started moving (walking/cycling/vehicle). This is a
 * lower-latency wake than the geofence exit, which only fires once already well
 * past the saved radius — so the start of the route is captured. We only ever
 * register ENTER transitions for moving activities, so any event here means
 * "started moving". If the service is gone there is nothing to wake — by design
 * parked mode only exists while the FGS is alive.
 */
class ActivityTransitionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!ActivityTransitionResult.hasResult(intent)) return
    val result = ActivityTransitionResult.extractResult(intent) ?: return
    val startedMoving = result.transitionEvents.any {
      it.transitionType == ActivityTransition.ACTIVITY_TRANSITION_ENTER
    }
    if (startedMoving) {
      Log.d("KelomitLoc", "activity-transition wake")
      LocationService.instance?.onActivityMoveWake()
    }
  }
}
