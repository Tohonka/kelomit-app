package com.kelomitapp.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent

/**
 * Always-on saved-place monitoring (separate from the parked-exit wake). On each
 * enter/exit transition it asks the running service to forward the crossing to
 * JS, which persists it + runs day-start/end inference. Independent of the GPS
 * fix stream — fires even while parked/dozing.
 */
class GeofenceCrossingReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val event = GeofencingEvent.fromIntent(intent) ?: return
    if (event.hasError()) return
    val type = when (event.geofenceTransition) {
      Geofence.GEOFENCE_TRANSITION_ENTER -> "enter"
      Geofence.GEOFENCE_TRANSITION_EXIT -> "exit"
      else -> return
    }
    val loc = event.triggeringLocation
    event.triggeringGeofences?.forEach { fence ->
      LocationService.instance?.onGeofenceCrossing(
        fence.requestId, type, loc?.latitude, loc?.longitude,
      )
    }
  }
}
