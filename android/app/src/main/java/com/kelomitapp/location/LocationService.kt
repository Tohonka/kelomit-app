package com.kelomitapp.location

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityRecognitionClient
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.DetectedActivity
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingClient
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.kelomitapp.MainActivity
import com.kelomitapp.R

/**
 * Foreground service for opt-in background GPS. Unlike the previous keep-alive-only
 * version, it now REQUESTS location itself via the fused provider — a location-typed
 * foreground service keeps getting updates under Doze, where the JS watch was
 * throttled. Each fix is emitted to JS (`onBackgroundLocation`), which runs the
 * existing processing pipeline. JS retunes cadence/power via [updateMode], and
 * parks the request entirely (OS geofence-exit wake) via [enterParked].
 */
class LocationService : Service() {
  companion object {
    private const val CHANNEL_ID = "location-tracking"
    private const val NOTIF_ID = 4711
    const val EXTRA_INTERVAL = "interval_ms"
    const val DEFAULT_INTERVAL_MS = 4000L

    // Diagnostics heartbeat: at most one "still alive" line per this interval,
    // driven off incoming fixes (no extra wakeups). ponytail: tune on device.
    private const val HEARTBEAT_MS = 10 * 60 * 1000L

    // Same-process handle so JS can retune the running service without
    // startForegroundService (which Android 12+ forbids from the background).
    @Volatile
    var instance: LocationService? = null
  }

  data class ParkFence(val id: Long, val latitude: Double, val longitude: Double, val radiusM: Float)

  private var fusedClient: FusedLocationProviderClient? = null
  private var geofencingClient: GeofencingClient? = null
  private var activityClient: ActivityRecognitionClient? = null
  private var parked = false
  private val geofencePendingIntent: PendingIntent by lazy {
    val intent = Intent(this, GeofenceExitReceiver::class.java)
    // FLAG_MUTABLE: the geofencing API fills in the triggering event (API 31+).
    PendingIntent.getBroadcast(
      this, 0, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
    )
  }
  private val activityPendingIntent: PendingIntent by lazy {
    val intent = Intent(this, ActivityTransitionReceiver::class.java)
    // FLAG_MUTABLE: the activity-recognition API fills in the transition result.
    PendingIntent.getBroadcast(
      this, 0, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
    )
  }
  // Diagnostics state: last availability (log only transitions) + a throttle so
  // the per-fix heartbeat lands at most every HEARTBEAT_MS.
  private var lastAvailable: Boolean? = null
  private var lastHeartbeatAt = 0L
  private var lastFixAt = 0L
  private val callback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      result.lastLocation?.let { emitLocation(it) }
    }

    // The "provider degrading" signal Tommi asked about: fires false when the
    // fused provider can no longer produce fixes (sensors off, indoors, Doze).
    override fun onLocationAvailability(availability: com.google.android.gms.location.LocationAvailability) {
      val available = availability.isLocationAvailable
      if (available != lastAvailable) {
        lastAvailable = available
        DiagLog.write(this@LocationService, "loc.availability", "available=$available parked=$parked")
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    fusedClient = LocationServices.getFusedLocationProviderClient(this)
    geofencingClient = LocationServices.getGeofencingClient(this)
    activityClient = ActivityRecognition.getClient(this)
    DiagLog.write(this, "svc.onCreate", "")
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } else {
      startForeground(NOTIF_ID, notification)
    }
    val interval = intent?.getLongExtra(EXTRA_INTERVAL, DEFAULT_INTERVAL_MS) ?: DEFAULT_INTERVAL_MS
    DiagLog.write(this, "svc.onStart", "interval=$interval flags=$flags")
    startLocationUpdates(interval, Priority.PRIORITY_HIGH_ACCURACY)
    return START_STICKY
  }

  /** Called from the JS bridge (same process) to change cadence + power level.
   *  Also exits parked state (JS calls this on app-foreground wake). */
  fun updateMode(mode: String, ms: Long) {
    if (parked) exitParked(restart = false)
    val priority = if (mode == "slow") {
      Priority.PRIORITY_BALANCED_POWER_ACCURACY // no GPS chip while idling
    } else {
      Priority.PRIORITY_HIGH_ACCURACY
    }
    startLocationUpdates(ms, priority)
  }

  /** Park: drop the location request entirely; arm OS geofence-exit wakes.
   *  The service (and its notification) stays alive — an idle process is
   *  ~free and keeps the React context warm for the wake. */
  @SuppressLint("MissingPermission")
  fun enterParked(fences: List<ParkFence>) {
    if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
      != PackageManager.PERMISSION_GRANTED || fences.isEmpty()
    ) {
      return
    }
    fusedClient?.removeLocationUpdates(callback)
    val geofences = fences.map {
      Geofence.Builder()
        .setRequestId(it.id.toString())
        .setCircularRegion(it.latitude, it.longitude, it.radiusM)
        .setExpirationDuration(Geofence.NEVER_EXPIRE)
        .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_EXIT)
        .build()
    }
    val request = GeofencingRequest.Builder()
      .setInitialTrigger(0) // never fire on registration
      .addGeofences(geofences)
      .build()
    geofencingClient?.addGeofences(request, geofencePendingIntent)
    requestActivityUpdates()
    parked = true
    DiagLog.write(this, "park.enter", "fences=${fences.size}")
    updateNotification(paused = true)
  }

  /** Second, lower-latency wake source while parked: the activity-recognition
   *  engine reporting the user started moving. Best-effort — if ACTIVITY_RECOGNITION
   *  isn't granted we simply lean on the geofence-exit fallback. */
  @SuppressLint("MissingPermission")
  private fun requestActivityUpdates() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
      ActivityCompat.checkSelfPermission(this, Manifest.permission.ACTIVITY_RECOGNITION)
      != PackageManager.PERMISSION_GRANTED
    ) {
      return
    }
    // Register ENTER transitions for every "moving" activity, so any event the
    // receiver sees means "started moving" (see ActivityTransitionReceiver).
    val moving = listOf(
      DetectedActivity.WALKING,
      DetectedActivity.RUNNING,
      DetectedActivity.ON_FOOT,
      DetectedActivity.ON_BICYCLE,
      DetectedActivity.IN_VEHICLE,
    )
    val transitions = moving.map {
      ActivityTransition.Builder()
        .setActivityType(it)
        .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
        .build()
    }
    activityClient?.requestActivityTransitionUpdates(
      ActivityTransitionRequest(transitions), activityPendingIntent,
    )
  }

  private fun removeActivityUpdates() {
    activityClient?.removeActivityTransitionUpdates(activityPendingIntent)
  }

  /** Geofence-exit wake (from GeofenceExitReceiver). */
  fun onGeofenceExitWake() {
    DiagLog.write(this, "wake.geofence", "parked=$parked")
    exitParked(restart = true)
  }

  /** Activity-recognition wake (from ActivityTransitionReceiver): the user
   *  started moving while parked. Ignore stray transitions when not parked. */
  fun onActivityMoveWake() {
    if (!parked) return
    DiagLog.write(this, "wake.activity", "")
    exitParked(restart = true)
  }

  private fun exitParked(restart: Boolean) {
    geofencingClient?.removeGeofences(geofencePendingIntent)
    removeActivityUpdates()
    parked = false
    DiagLog.write(this, "park.exit", "restart=$restart")
    updateNotification(paused = false)
    if (restart) {
      startLocationUpdates(DEFAULT_INTERVAL_MS, Priority.PRIORITY_HIGH_ACCURACY)
    }
  }

  private fun updateNotification(paused: Boolean) {
    val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    mgr.notify(NOTIF_ID, buildNotification(paused))
  }

  @SuppressLint("MissingPermission")
  private fun startLocationUpdates(intervalMs: Long, priority: Int) {
    val client = fusedClient ?: return
    if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
      != PackageManager.PERMISSION_GRANTED
    ) {
      return // JS owns the permission prompt; do nothing until granted
    }
    val request = LocationRequest.Builder(priority, intervalMs)
      .setMinUpdateDistanceMeters(10f)
      .build()
    client.removeLocationUpdates(callback)
    client.requestLocationUpdates(request, callback, Looper.getMainLooper())
  }

  private fun emitLocation(loc: Location) {
    val map = Arguments.createMap().apply {
      putDouble("latitude", loc.latitude)
      putDouble("longitude", loc.longitude)
      putDouble("accuracy", loc.accuracy.toDouble())
      if (loc.hasAltitude()) putDouble("altitude", loc.altitude) else putNull("altitude")
      if (loc.hasSpeed()) putDouble("speed", loc.speed.toDouble()) else putNull("speed")
      putDouble("timestamp", loc.time.toDouble())
    }
    val reactContext = (application as? ReactApplication)?.reactHost?.currentReactContext
    Log.d(
      "KelomitLoc",
      "fix lat=${loc.latitude} lon=${loc.longitude} spd=${loc.speed} acc=${loc.accuracy} ctx=${reactContext != null}",
    )
    // Heartbeat: throttled proof-of-life with the gap since the last fix (a big
    // gap = provider stall or a Doze throttle) and whether JS is reachable.
    val now = System.currentTimeMillis()
    if (now - lastHeartbeatAt >= HEARTBEAT_MS) {
      val sinceFix = if (lastFixAt == 0L) -1 else now - lastFixAt
      DiagLog.write(this, "hb", "sinceFixMs=$sinceFix acc=${loc.accuracy} ctx=${reactContext != null}")
      lastHeartbeatAt = now
    }
    lastFixAt = now
    reactContext?.emitDeviceEvent("onBackgroundLocation", map)
  }

  override fun onDestroy() {
    super.onDestroy()
    DiagLog.write(this, "svc.onDestroy", "parked=$parked")
    fusedClient?.removeLocationUpdates(callback)
    geofencingClient?.removeGeofences(geofencePendingIntent)
    removeActivityUpdates()
    instance = null
    stopForeground(STOP_FOREGROUND_REMOVE)
  }

  private fun buildNotification(paused: Boolean = false): Notification {
    createChannel()
    val tapIntent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      tapIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(getString(R.string.location_service_title))
      .setContentText(getString(if (paused) R.string.location_service_paused_text else R.string.location_service_text))
      .setSmallIcon(R.drawable.ic_stat_tracking)
      .setOngoing(true)
      .setShowWhen(false)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(pendingIntent)
      .build()
  }

  private fun createChannel() {
    val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        getString(R.string.location_channel_name),
        NotificationManager.IMPORTANCE_LOW,
      ).apply { setShowBadge(false) }
      mgr.createNotificationChannel(channel)
    }
  }
}
