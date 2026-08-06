package com.kelomitapp.widget

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import com.kelomitapp.MainActivity
import com.kelomitapp.R

/**
 * Ongoing "timer running" notification (media-player style), owned by native
 * code so it stays correct while the RN app is dead. [sync] is called from
 * [WidgetCommon.updateAll], which already runs on every session transition
 * from both JS and widget taps.
 */
object TimerNotification {
  private const val CHANNEL_ID = "kelomit_timer"
  private const val NOTIFICATION_ID = 2001

  fun sync(context: Context) {
    val manager =
      context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    val active = SessionStore.getActive(context)
      ?.let { runCatching { org.json.JSONObject(it) }.getOrNull() }
    if (active == null) {
      manager.cancel(NOTIFICATION_ID)
      return
    }
    ensureChannel(manager, context)

    val paused = WidgetCommon.isPaused(active)
    val total = WidgetCommon.totalElapsedMillis(active) ?: 0L
    // optName gates on isNull first — a bare optString("name") would return the
    // literal string "null" for a JSON-null name (see WidgetCommon.optName doc).
    val name = WidgetCommon.optName(active) ?: context.getString(R.string.widget_title)

    val openApp = PendingIntent.getActivity(
      context, 0,
      Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val invalid = AppWidgetManager.INVALID_APPWIDGET_ID
    val stopIntent =
      WidgetCommon.togglePendingIntent(context, SessionWidgetProvider::class.java, invalid)
    val pauseIntent = WidgetCommon.pausePendingIntent(context, invalid)

    val builder = Notification.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_widget_play)
      .setContentTitle(name)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(openApp)
      .addAction(Notification.Action.Builder(
        null, context.getString(if (paused) R.string.widget_resume else R.string.widget_pause),
        pauseIntent).build())
      .addAction(Notification.Action.Builder(
        null, context.getString(R.string.widget_stop), stopIntent).build())

    if (paused) {
      builder
        .setContentText(
          context.getString(R.string.timer_notification_paused, formatDuration(total)))
        .setUsesChronometer(false)
    } else {
      builder
        .setWhen(System.currentTimeMillis() - total)
        .setUsesChronometer(true)
    }
    manager.notify(NOTIFICATION_ID, builder.build())
  }

  private fun ensureChannel(manager: NotificationManager, context: Context) {
    if (manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(
          CHANNEL_ID,
          context.getString(R.string.timer_notification_channel),
          NotificationManager.IMPORTANCE_LOW,
        ),
      )
    }
  }

  private fun formatDuration(ms: Long): String {
    val totalMin = ms / 60_000
    val h = totalMin / 60
    val min = totalMin % 60
    return if (h > 0) "$h h $min min" else "$min min"
  }
}
