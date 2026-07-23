package com.kelomitapp.location

import android.Manifest
import android.annotation.SuppressLint
import android.app.ForegroundServiceStartNotAllowedException
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import java.time.Instant
import java.time.ZoneId

object PlaceMonitor {
  private const val REQUEST_CODE = 4712
  private const val PREFS = "native-location-places"
  private const val KEY_CANDIDATE_AT = "candidate_at"

  private fun pendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, GeofenceCrossingReceiver::class.java)
    return PendingIntent.getBroadcast(
      context,
      REQUEST_CODE,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
    )
  }

  @SuppressLint("MissingPermission")
  fun sync(context: Context): Task<Void> {
    if (ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
      != PackageManager.PERMISSION_GRANTED
    ) {
      return Tasks.forException(SecurityException("Fine location permission is required"))
    }

    val client = LocationServices.getGeofencingClient(context)
    val pendingIntent = pendingIntent(context)
    val places = NativePlaceStore(context).all()
    return client.removeGeofences(pendingIntent).continueWithTask { removal ->
      if (!removal.isSuccessful) {
        return@continueWithTask Tasks.forException(
          removal.exception ?: IllegalStateException("Could not remove old geofences"),
        )
      }
      if (places.isEmpty()) {
        Tasks.forResult(null)
      } else {
        val geofences = places.map { place ->
          Geofence.Builder()
            .setRequestId(place.id.toString())
            .setCircularRegion(
              place.latitude,
              place.longitude,
              maxOf(place.radiusM, 100f),
            )
            .setExpirationDuration(Geofence.NEVER_EXPIRE)
            .setTransitionTypes(
              Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT,
            )
            .build()
        }
        val request = GeofencingRequest.Builder()
          .setInitialTrigger(0)
          .addGeofences(geofences)
          .build()
        client.addGeofences(request, pendingIntent)
      }
    }
  }

  fun onCandidate(context: Context) {
    val persisted = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putLong(KEY_CANDIDATE_AT, System.currentTimeMillis())
      .commit()
    if (!persisted) {
      DiagLog.write(context, "crossing.candidate.fail", "persist")
    }

    LocationService.instance?.let {
      it.requestPlaceConfirmation()
      return
    }
    if (!NativeTrackingSettings(context).enabled) return

    try {
      ContextCompat.startForegroundService(
        context,
        Intent(context, LocationService::class.java),
      )
    } catch (error: ForegroundServiceStartNotAllowedException) {
      DiagLog.write(context, "crossing.wake.fail", error.javaClass.simpleName)
    } catch (error: SecurityException) {
      DiagLog.write(context, "crossing.wake.fail", error.javaClass.simpleName)
    }
  }

  @Synchronized
  fun onFix(context: Context, location: Location): List<Crossing> {
    val store = NativePlaceStore(context)
    val distances = store.all().map { place ->
      val result = FloatArray(1)
      Location.distanceBetween(
        location.latitude,
        location.longitude,
        place.latitude,
        place.longitude,
        result,
      )
      PlaceDistance(place, result[0])
    }
    val reduced = PlaceMembership.reduce(distances, store.insideIds())
    val timestamp = location.time.takeIf { it > 0L } ?: System.currentTimeMillis()
    val localDate = Instant.ofEpochMilli(timestamp)
      .atZone(ZoneId.systemDefault())
      .toLocalDate()
      .toString()
    val journal = NativeEventJournal(context)
    reduced.crossings.forEach { crossing ->
      journal.append(
        "crossing",
        mapOf(
          "locationId" to crossing.place.id,
          "kind" to crossing.place.kind,
          "direction" to crossing.direction,
          "timestamp" to timestamp,
          "localDate" to localDate,
          "generation" to store.generation(),
          "latitude" to location.latitude,
          "longitude" to location.longitude,
        ),
      )
      DiagLog.write(
        context,
        "crossing.accept",
        "id=${crossing.place.id} kind=${crossing.place.kind} type=${crossing.direction}",
      )
      if (crossing.place.kind == "work") {
        WorkdayCoordinator.onCrossing(
          context,
          crossing.place.id,
          crossing.direction,
          timestamp,
        )
      }
    }
    store.setInsideIds(reduced.insideIds)
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .remove(KEY_CANDIDATE_AT)
      .apply()
    return reduced.crossings
  }
}
