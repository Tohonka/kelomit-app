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
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.google.android.gms.location.FusedLocationProviderClient
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
 * existing processing pipeline. JS retunes the interval via [updateInterval].
 */
class LocationService : Service() {
  companion object {
    private const val CHANNEL_ID = "location-tracking"
    private const val NOTIF_ID = 4711
    const val EXTRA_INTERVAL = "interval_ms"
    const val DEFAULT_INTERVAL_MS = 4000L

    // Same-process handle so JS can retune the running service without
    // startForegroundService (which Android 12+ forbids from the background).
    @Volatile
    var instance: LocationService? = null
  }

  private var fusedClient: FusedLocationProviderClient? = null
  private val callback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      result.lastLocation?.let { emitLocation(it) }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    fusedClient = LocationServices.getFusedLocationProviderClient(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } else {
      startForeground(NOTIF_ID, notification)
    }
    val interval = intent?.getLongExtra(EXTRA_INTERVAL, DEFAULT_INTERVAL_MS) ?: DEFAULT_INTERVAL_MS
    startLocationUpdates(interval)
    return START_STICKY
  }

  /** Called from the JS bridge (same process) to change the request cadence. */
  fun updateInterval(ms: Long) {
    startLocationUpdates(ms)
  }

  @SuppressLint("MissingPermission")
  private fun startLocationUpdates(intervalMs: Long) {
    val client = fusedClient ?: return
    if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
      != PackageManager.PERMISSION_GRANTED
    ) {
      return // JS owns the permission prompt; do nothing until granted
    }
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
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
    reactContext?.emitDeviceEvent("onBackgroundLocation", map)
  }

  override fun onDestroy() {
    super.onDestroy()
    fusedClient?.removeLocationUpdates(callback)
    instance = null
    stopForeground(STOP_FOREGROUND_REMOVE)
  }

  private fun buildNotification(): Notification {
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
      .setContentText(getString(R.string.location_service_text))
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
