package com.kelomitapp.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent

/**
 * Wakes the parked [LocationService] when the OS reports we left a saved
 * place. If the service is gone (process killed), there is nothing to wake —
 * by design parked mode only exists while the FGS is alive.
 */
class GeofenceExitReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val event = GeofencingEvent.fromIntent(intent) ?: return
    if (event.hasError()) {
      Log.d("KelomitLoc", "geofence event error=${event.errorCode}")
      return
    }
    if (event.geofenceTransition == Geofence.GEOFENCE_TRANSITION_EXIT) {
      LocationService.instance?.onGeofenceExitWake()
    }
  }
}
