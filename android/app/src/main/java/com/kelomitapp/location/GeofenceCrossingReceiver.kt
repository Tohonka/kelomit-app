package com.kelomitapp.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.GeofencingEvent

/**
 * OS geofence transitions are coarse wake signals. A fused fix is always checked
 * against the user's configured radius before a crossing is accepted.
 */
class GeofenceCrossingReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val event = GeofencingEvent.fromIntent(intent) ?: return
    if (event.hasError()) return
    DiagLog.write(
      context,
      "crossing.candidate",
      "transition=${event.geofenceTransition} count=${event.triggeringGeofences?.size ?: 0}",
    )
    PlaceMonitor.onCandidate(context)
  }
}
