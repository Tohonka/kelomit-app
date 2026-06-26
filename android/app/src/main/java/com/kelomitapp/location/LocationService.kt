package com.kelomitapp.location

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.kelomitapp.MainActivity
import com.kelomitapp.R

/**
 * Minimal foreground service for opt-in background GPS (Iteration 3, post-9.2).
 *
 * It does not request location itself — it exists to keep the app process alive
 * and declare a `location` foreground-service type, so the existing JS location
 * watch (`gpsService.ts`) keeps delivering fixes while the app is closed. That
 * means a work perimeter crossing at 16:00 is detected at 16:00 instead of when
 * the app is next opened. Started/stopped from JS via [BackgroundLocationModule]
 * on the app's background/foreground transitions.
 */
class LocationService : Service() {
  companion object {
    private const val CHANNEL_ID = "location-tracking"
    private const val NOTIF_ID = 4711
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } else {
      startForeground(NOTIF_ID, notification)
    }
    return START_STICKY
  }

  override fun onDestroy() {
    super.onDestroy()
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
