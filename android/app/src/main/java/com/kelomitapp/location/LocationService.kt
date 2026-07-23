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
import com.google.android.gms.tasks.CancellationTokenSource
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

    // Native self-tuning (mirrors the JS ladder's thresholds in trackingMode.ts).
    // The slow→fast upgrade must NOT depend on JS being alive: pace changes were
    // outrun whenever the round trip (native fix → JS isMoving → setMode) was
    // throttled or the React context was dead — the "straight lines" family.
    private const val MOVE_SPEED_MS = 1.0f // m/s, same bar as JS isMoving
    private const val GOOD_ACC_M = 50f // displacement only trusted at this accuracy
    private const val SLOW_FALLBACK_MS = 60_000L
    // JS owns the fast→slow downgrade; this native fallback fires only while the
    // React context is dead so a restarted-sticky service can't burn battery in
    // fast mode forever. ~1 min of still fixes at fast cadence.
    private const val STILL_STREAK_TO_SLOW = 15
    // Periodic activity sampling while in slow mode: catches pace changes the
    // transition API misses/batches. Off in fast (GPS already dense) and parked
    // (transitions + geofence-exit cover the wake). ponytail: tune on device.
    private const val AR_SAMPLE_MS = 20_000L
    private const val AR_SAMPLE_REQUEST_CODE = 2
    // Fixes arriving while the React context is dead are appended here (JSONL)
    // and drained into the normal JS pipeline on next app start — context death
    // becomes deferred persistence instead of a hole in the trail.
    const val FIX_BUFFER_FILE = "kelomit-fix-buffer.jsonl"
    private const val FIX_BUFFER_MAX_BYTES = 5L * 1024 * 1024 // keep newest era

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
  // Native self-tuning state (see companion constants).
  @Volatile
  private var currentIntervalMs = DEFAULT_INTERVAL_MS
  private var lastFix: Location? = null
  private var stillStreak = 0
  private var samplingActive = false
  private var lastCtxAlive = true
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
  // Separate PendingIntent (own request code) for periodic activity SAMPLING —
  // same receiver, but sharing the transitions PI would overwrite it.
  private val activitySamplingPendingIntent: PendingIntent by lazy {
    val intent = Intent(this, ActivityTransitionReceiver::class.java)
    PendingIntent.getBroadcast(
      this, AR_SAMPLE_REQUEST_CODE, intent,
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
    // Keep activity-recognition registered for the whole service lifetime (not
    // just while parked): it's a low-power sensor-hub signal that lets the ladder
    // upgrade slow→fast the moment the user starts moving, before GPS can.
    requestActivityUpdates()
    WorkdayCoordinator.restoreDeadlines(this)
    return START_STICKY
  }

  /** Called from the JS bridge (same process) to change cadence + power level.
   *  Also exits parked state (JS calls this on app-foreground wake). */
  fun updateMode(mode: String, ms: Long) {
    if (parked) exitParked(restart = false)
    // Always high-accuracy, even in slow mode. BALANCED_POWER drops the GPS chip
    // for network/cell fixes, which report speed=null + huge accuracy — so once
    // slow, JS could never see the real speed/displacement that upgrades back to
    // fast, and whole commutes straight-lined (2026-07-10). The battery saving in
    // slow comes from the long interval (ms), not the accuracy flag.
    startLocationUpdates(ms, Priority.PRIORITY_HIGH_ACCURACY)
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
    setActivitySampling(false) // transitions + geofence-exit cover the parked wake
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
    parked = true
    DiagLog.write(this, "park.enter", "fences=${fences.size}")
    updateNotification(paused = true)
  }

  /** Lower-latency movement signal: the activity-recognition engine reporting
   *  the user started moving. Registered for the whole service lifetime.
   *  Best-effort — if ACTIVITY_RECOGNITION isn't granted we simply lean on GPS
   *  (and, while parked, the geofence-exit fallback). */
  @SuppressLint("MissingPermission")
  private fun requestActivityUpdates() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
      ActivityCompat.checkSelfPermission(this, Manifest.permission.ACTIVITY_RECOGNITION)
      != PackageManager.PERMISSION_GRANTED
    ) {
      DiagLog.write(this, "activity.skip", "no-permission")
      return
    }
    DiagLog.write(this, "activity.register", "")
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
    if (samplingActive) {
      activityClient?.removeActivityUpdates(activitySamplingPendingIntent)
      samplingActive = false
    }
  }

  /** Geofence-exit wake (from GeofenceExitReceiver). */
  fun onGeofenceExitWake() {
    DiagLog.write(this, "wake.geofence", "parked=$parked")
    exitParked(restart = true)
  }

  /** Activity-recognition wake (from ActivityTransitionReceiver): the user
   *  started moving. Self-upgrade to fast natively — waiting for JS to round-trip
   *  the upgrade is exactly what lost pace changes — and tell JS so its ladder
   *  state converges. */
  fun onActivityMoveWake() {
    DiagLog.write(this, "wake.activity", "parked=$parked interval=$currentIntervalMs")
    emitActivityMoving()
    if (parked) {
      exitParked(restart = true)
    } else if (currentIntervalMs > DEFAULT_INTERVAL_MS) {
      DiagLog.write(this, "mode.upgrade", "by=ar-native")
      startLocationUpdates(DEFAULT_INTERVAL_MS, Priority.PRIORITY_HIGH_ACCURACY)
    }
  }

  private fun exitParked(restart: Boolean) {
    geofencingClient?.removeGeofences(geofencePendingIntent)
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
    // No setMinUpdateDistanceMeters: a distance filter withheld all fixes while
    // stationary, starving JS's fix-driven fast→slow downgrade (5-hour deadlock
    // 2026-07-08). Fixes flow at the interval; JS's isStationaryJitter gate keeps
    // stationary drift out of the trail.
    // MinUpdateInterval stays at fast cadence even in slow mode: when any OTHER
    // app requests location, we piggyback its fixes for free — so a pace change
    // is often seen (and self-upgraded on) well before our own slow tick.
    val request = LocationRequest.Builder(priority, intervalMs)
      .setMinUpdateIntervalMillis(minOf(intervalMs, DEFAULT_INTERVAL_MS))
      .build()
    client.removeLocationUpdates(callback)
    client.requestLocationUpdates(request, callback, Looper.getMainLooper())
    currentIntervalMs = intervalMs
    stillStreak = 0
    setActivitySampling(intervalMs > DEFAULT_INTERVAL_MS)
  }

  /** Periodic activity sampling (slow mode only): a second, low-power movement
   *  signal beyond transitions, which the OS can batch or miss on gradual pace
   *  changes. The receiver treats a confident moving sample as a move wake. */
  @SuppressLint("MissingPermission")
  private fun setActivitySampling(on: Boolean) {
    if (on == samplingActive) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
      ActivityCompat.checkSelfPermission(this, Manifest.permission.ACTIVITY_RECOGNITION)
      != PackageManager.PERMISSION_GRANTED
    ) return
    samplingActive = on
    DiagLog.write(this, "activity.sample", "on=$on")
    if (on) {
      activityClient?.requestActivityUpdates(AR_SAMPLE_MS, activitySamplingPendingIntent)
    } else {
      activityClient?.removeActivityUpdates(activitySamplingPendingIntent)
    }
  }

  private fun emitLocation(loc: Location) {
    try {
      PlaceMonitor.onFix(this, loc)
    } catch (error: Exception) {
      DiagLog.write(this, "crossing.confirm.fail", error.javaClass.simpleName)
    }
    val map = Arguments.createMap().apply {
      putDouble("latitude", loc.latitude)
      putDouble("longitude", loc.longitude)
      putDouble("accuracy", loc.accuracy.toDouble())
      if (loc.hasAltitude()) putDouble("altitude", loc.altitude) else putNull("altitude")
      if (loc.hasSpeed()) putDouble("speed", loc.speed.toDouble()) else putNull("speed")
      putDouble("timestamp", loc.time.toDouble())
    }
    val reactContext = (application as? ReactApplication)?.reactHost?.currentReactContext
    val ctxAlive = reactContext != null
    Log.d(
      "KelomitLoc",
      "fix lat=${loc.latitude} lon=${loc.longitude} spd=${loc.speed} acc=${loc.accuracy} ctx=$ctxAlive",
    )
    // Heartbeat: throttled proof-of-life with the gap since the last fix (a big
    // gap = provider stall or a Doze throttle) and whether JS is reachable.
    val now = System.currentTimeMillis()
    if (now - lastHeartbeatAt >= HEARTBEAT_MS) {
      val sinceFix = if (lastFixAt == 0L) -1 else now - lastFixAt
      DiagLog.write(this, "hb", "sinceFixMs=$sinceFix acc=${loc.accuracy} ctx=$ctxAlive")
      lastHeartbeatAt = now
    }
    lastFixAt = now
    maybeSelfTune(loc, ctxAlive)
    if (reactContext != null) {
      reactContext.emitDeviceEvent("onBackgroundLocation", map)
    } else {
      bufferFix(loc)
    }
    if (ctxAlive != lastCtxAlive) {
      DiagLog.write(this, "ctx.change", "alive=$ctxAlive")
      lastCtxAlive = ctxAlive
    }
  }

  @SuppressLint("MissingPermission")
  fun requestPlaceConfirmation() {
    if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
      != PackageManager.PERMISSION_GRANTED
    ) return
    val token = CancellationTokenSource()
    fusedClient
      ?.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, token.token)
      ?.addOnSuccessListener { location -> if (location != null) emitLocation(location) }
      ?.addOnFailureListener {
        DiagLog.write(this, "crossing.confirm.fail", it.javaClass.simpleName)
      }
  }

  /** Native fallback ladder, independent of JS liveness. Upgrade slow→fast the
   *  moment a fix says moving (same speed/displacement bar as JS isMoving, and
   *  displacement only trusted between decent-accuracy fixes); downgrade to slow
   *  ONLY while the React context is dead — JS owns the downgrade otherwise. */
  private fun maybeSelfTune(loc: Location, ctxAlive: Boolean) {
    val prev = lastFix
    lastFix = loc
    var moving = loc.hasSpeed() && loc.speed >= MOVE_SPEED_MS
    if (!moving && prev != null && loc.accuracy <= GOOD_ACC_M && prev.accuracy <= GOOD_ACC_M) {
      val dtSec = (loc.time - prev.time) / 1000.0
      moving = dtSec > 0 && loc.distanceTo(prev) / dtSec >= MOVE_SPEED_MS
    }
    if (moving) {
      stillStreak = 0
      if (currentIntervalMs > DEFAULT_INTERVAL_MS) {
        DiagLog.write(this, "mode.upgrade", "by=native-fix spd=${loc.speed} acc=${loc.accuracy}")
        startLocationUpdates(DEFAULT_INTERVAL_MS, Priority.PRIORITY_HIGH_ACCURACY)
        emitActivityMoving() // let the JS ladder converge to fast too
      }
    } else {
      stillStreak++
      if (!ctxAlive && currentIntervalMs < SLOW_FALLBACK_MS && stillStreak >= STILL_STREAK_TO_SLOW) {
        DiagLog.write(this, "mode.downgrade", "by=native-fallback streak=$stillStreak")
        startLocationUpdates(SLOW_FALLBACK_MS, Priority.PRIORITY_HIGH_ACCURACY)
      }
    }
  }

  /** Append a fix the dead React context couldn't receive to the JSONL buffer;
   *  JS drains it into the normal pipeline on next start. */
  private fun bufferFix(loc: Location) {
    try {
      val file = java.io.File(filesDir, FIX_BUFFER_FILE)
      // ponytail: crude cap — drop the old era rather than rotating; newest
      // data matters most and the file is drained on every app open.
      if (file.length() > FIX_BUFFER_MAX_BYTES) file.delete()
      val alt = if (loc.hasAltitude()) loc.altitude.toString() else "null"
      val spd = if (loc.hasSpeed()) loc.speed.toString() else "null"
      file.appendText(
        "{\"latitude\":${loc.latitude},\"longitude\":${loc.longitude}," +
          "\"accuracy\":${loc.accuracy},\"altitude\":$alt,\"speed\":$spd," +
          "\"timestamp\":${loc.time}}\n",
      )
    } catch (e: Exception) {
      Log.d("KelomitLoc", "bufferFix failed: ${e.message}")
    }
  }

  /** Tell JS the activity engine reports the user started moving, so the ladder
   *  can upgrade slow→fast immediately without waiting for a good GPS fix. Uses
   *  the same reactHost path as emitLocation (New Arch: reactHost, not
   *  reactNativeHost, which throws). */
  private fun emitActivityMoving() {
    val reactContext = (application as? ReactApplication)?.reactHost?.currentReactContext
    val map = Arguments.createMap().apply {
      putBoolean("moving", true)
      putDouble("timestamp", System.currentTimeMillis().toDouble())
    }
    reactContext?.emitDeviceEvent("onActivityTransition", map)
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
