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
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.kelomitapp.MainActivity
import com.kelomitapp.R

/**
 * Sole owner of Android background location requests. Mode decisions are fully
 * native so React lifecycle and saved-place membership cannot stop movement
 * tracking. JavaScript receives fixes only for persistence and live UI updates.
 */
class LocationService : Service() {
  companion object {
    private const val CHANNEL_ID = "location-tracking"
    private const val NOTIF_ID = 4711
    const val EXTRA_SLOW_INTERVAL = "slow_interval_ms"
    const val DEFAULT_INTERVAL_MS = TrackingPolicy.FAST_MS
    const val FIX_BUFFER_FILE = "kelomit-fix-buffer.jsonl"
    val FIX_BUFFER_LOCK = Any()

    private const val HEARTBEAT_MS = 10 * 60 * 1000L
    private const val GOOD_ACC_M = 50f
    private const val MOVE_SPEED_MS = 1.0f
    private const val AR_SAMPLE_MS = 20_000L
    private const val AR_SAMPLE_REQUEST_CODE = 2
    private const val FIX_BUFFER_MAX_BYTES = 5L * 1024 * 1024

    @Volatile
    var instance: LocationService? = null

    /** Explicit-disable cleanup. Service recreation must not unregister these. */
    fun removeActivityUpdates(context: Context) {
      val client = ActivityRecognition.getClient(context)
      client.removeActivityTransitionUpdates(activityPendingIntent(context))
      client.removeActivityUpdates(activitySamplingPendingIntent(context))
    }

    private fun activityPendingIntent(context: Context): PendingIntent =
      PendingIntent.getBroadcast(
        context,
        0,
        Intent(context, ActivityTransitionReceiver::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
      )

    private fun activitySamplingPendingIntent(context: Context): PendingIntent =
      PendingIntent.getBroadcast(
        context,
        AR_SAMPLE_REQUEST_CODE,
        Intent(context, ActivityTransitionReceiver::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
      )
  }

  private var fusedClient: FusedLocationProviderClient? = null
  private var activityClient: ActivityRecognitionClient? = null
  private var slowIntervalMs = 60_000L
  private var policy = TrackingPolicy.State()
  private var lastFix: Location? = null
  private var samplingActive = false
  private var appliedIntervalMs: Long? = Long.MIN_VALUE
  private var lastCtxAlive = true
  private var lastAvailable: Boolean? = null
  private var lastHeartbeatAt = 0L
  private var lastFixAt = 0L

  private val callback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      result.lastLocation?.let(::emitLocation)
    }

    override fun onLocationAvailability(
      availability: com.google.android.gms.location.LocationAvailability,
    ) {
      val available = availability.isLocationAvailable
      if (available != lastAvailable) {
        lastAvailable = available
        DiagLog.write(this@LocationService, "loc.availability", "available=$available mode=${policy.mode}")
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    fusedClient = LocationServices.getFusedLocationProviderClient(this)
    activityClient = ActivityRecognition.getClient(this)
    DiagLog.write(this, "svc.onCreate", "")
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val settings = NativeTrackingSettings(this)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } else {
      startForeground(NOTIF_ID, buildNotification())
    }
    if (!settings.enabled) {
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    slowIntervalMs = intent?.getLongExtra(EXTRA_SLOW_INTERVAL, settings.slowIntervalMs)
      ?: settings.slowIntervalMs
    settings.slowIntervalMs = slowIntervalMs

    val now = System.currentTimeMillis()
    policy = if (settings.movingUntilMs > now) {
      TrackingPolicy.reduce(TrackingPolicy.State(), TrackingPolicy.Signal.Moving(now))
    } else {
      settings.policyState(slowIntervalMs)
    }
    DiagLog.write(this, "svc.onStart", "mode=${policy.mode} slow=$slowIntervalMs flags=$flags")
    requestActivityUpdates()
    applyPolicy(force = true)
    WorkdayCoordinator.restoreDeadlines(this)
    return START_STICKY
  }

  /** Context-independent Activity Recognition stores the lease before this call. */
  fun onActivityMoveWake(nowMs: Long = System.currentTimeMillis()) {
    policy = TrackingPolicy.reduce(policy, TrackingPolicy.Signal.Moving(nowMs))
    NativeTrackingSettings(this).movingUntilMs = policy.movingUntilMs
    DiagLog.write(this, "wake.activity", "leaseUntil=${policy.movingUntilMs}")
    applyPolicy()
  }

  private fun tuneFromFix(loc: Location) {
    val previous = lastFix
    lastFix = loc
    var moving = loc.hasSpeed() && loc.speed >= MOVE_SPEED_MS
    var measuredSpeed = if (loc.hasSpeed()) loc.speed else 0f
    if (!moving && previous != null && loc.accuracy <= GOOD_ACC_M && previous.accuracy <= GOOD_ACC_M) {
      val elapsedSeconds = (loc.time - previous.time) / 1000f
      if (elapsedSeconds > 0f) {
        measuredSpeed = loc.distanceTo(previous) / elapsedSeconds
        moving = measuredSpeed >= MOVE_SPEED_MS
      }
    }
    policy = TrackingPolicy.reduce(
      policy,
      if (moving) TrackingPolicy.Signal.MovingFix(measuredSpeed, System.currentTimeMillis())
      else TrackingPolicy.Signal.StillFix(System.currentTimeMillis()),
    )
    persistPolicy()
    applyPolicy()
  }

  private fun persistPolicy() {
    NativeTrackingSettings(this).savePolicyState(policy)
  }

  @SuppressLint("MissingPermission")
  private fun applyPolicy(force: Boolean = false) {
    val client = fusedClient ?: return
    val requestedInterval = when (policy.mode) {
      TrackingPolicy.Mode.FAST -> policy.intervalMs
      TrackingPolicy.Mode.SLOW -> slowIntervalMs
      TrackingPolicy.Mode.IDLE -> null
    }
    if (requestedInterval == null) {
      if (!force && appliedIntervalMs == null) return
      client.removeLocationUpdates(callback)
      appliedIntervalMs = null
      setActivitySampling(true)
      updateNotification(idle = true)
      return
    }
    if (!force && appliedIntervalMs == requestedInterval) return
    startLocationUpdates(requestedInterval)
    appliedIntervalMs = requestedInterval
    updateNotification(idle = false)
  }

  @SuppressLint("MissingPermission")
  private fun startLocationUpdates(intervalMs: Long) {
    val client = fusedClient ?: return
    if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
      != PackageManager.PERMISSION_GRANTED
    ) return
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
      .setMinUpdateIntervalMillis(minOf(intervalMs, TrackingPolicy.FAST_MS))
      .build()
    client.removeLocationUpdates(callback)
    client.requestLocationUpdates(request, callback, Looper.getMainLooper())
    setActivitySampling(intervalMs > TrackingPolicy.FAST_MS)
  }

  @SuppressLint("MissingPermission")
  private fun requestActivityUpdates() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
      ActivityCompat.checkSelfPermission(this, Manifest.permission.ACTIVITY_RECOGNITION)
      != PackageManager.PERMISSION_GRANTED
    ) {
      DiagLog.write(this, "activity.skip", "no-permission")
      return
    }
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
      ActivityTransitionRequest(transitions),
      activityPendingIntent(this),
    )
    DiagLog.write(this, "activity.register", "")
  }

  @SuppressLint("MissingPermission")
  private fun setActivitySampling(on: Boolean) {
    if (on == samplingActive) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
      ActivityCompat.checkSelfPermission(this, Manifest.permission.ACTIVITY_RECOGNITION)
      != PackageManager.PERMISSION_GRANTED
    ) return
    samplingActive = on
    if (on) {
      activityClient?.requestActivityUpdates(AR_SAMPLE_MS, activitySamplingPendingIntent(this))
    } else {
      activityClient?.removeActivityUpdates(activitySamplingPendingIntent(this))
    }
    DiagLog.write(this, "activity.sample", "on=$on")
  }

  private fun emitLocation(loc: Location) {
    try {
      PlaceMonitor.onFix(this, loc)
    } catch (error: Exception) {
      DiagLog.write(this, "crossing.confirm.fail", error.javaClass.simpleName)
    }
    tuneFromFix(loc)

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
    val now = System.currentTimeMillis()
    if (now - lastHeartbeatAt >= HEARTBEAT_MS) {
      val gap = if (lastFixAt == 0L) -1 else now - lastFixAt
      DiagLog.write(this, "hb", "sinceFixMs=$gap acc=${loc.accuracy} ctx=$ctxAlive mode=${policy.mode}")
      lastHeartbeatAt = now
    }
    lastFixAt = now
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

  private fun bufferFix(loc: Location) {
    try {
      synchronized(FIX_BUFFER_LOCK) {
        val file = java.io.File(filesDir, FIX_BUFFER_FILE)
        if (file.length() > FIX_BUFFER_MAX_BYTES) file.delete()
        val altitude = if (loc.hasAltitude()) loc.altitude.toString() else "null"
        val speed = if (loc.hasSpeed()) loc.speed.toString() else "null"
        file.appendText(
          "{\"latitude\":${loc.latitude},\"longitude\":${loc.longitude}," +
            "\"accuracy\":${loc.accuracy},\"altitude\":$altitude,\"speed\":$speed," +
            "\"timestamp\":${loc.time}}\n",
        )
      }
    } catch (error: Exception) {
      Log.d("KelomitLoc", "bufferFix failed: ${error.message}")
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    DiagLog.write(this, "svc.onDestroy", "mode=${policy.mode}")
    fusedClient?.removeLocationUpdates(callback)
    instance = null
    stopForeground(STOP_FOREGROUND_REMOVE)
  }

  private fun updateNotification(idle: Boolean) {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(NOTIF_ID, buildNotification(idle))
  }

  private fun buildNotification(idle: Boolean = false): Notification {
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
      .setContentText(getString(if (idle) R.string.location_service_idle_text else R.string.location_service_text))
      .setSmallIcon(R.drawable.ic_stat_tracking)
      .setOngoing(true)
      .setShowWhen(false)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(pendingIntent)
      .build()
  }

  private fun createChannel() {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(
          CHANNEL_ID,
          getString(R.string.location_channel_name),
          NotificationManager.IMPORTANCE_LOW,
        ).apply { setShowBadge(false) },
      )
    }
  }
}
