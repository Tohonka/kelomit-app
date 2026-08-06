package com.kelomitapp.location

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Single owner of the "tracking paused" state (widget iteration 2). Paused
 * means NO location capture at all: the foreground service is stopped, place
 * geofences are unregistered, and the JS watch checks the same flag before
 * starting. Timed pauses resume via AlarmManager so they work app-dead;
 * [expireIfDue] is the belt-and-braces path (boot, app foreground) since
 * inexact alarms can drift and don't survive reboot.
 */
object TrackingPause {
  private const val ALARM_REQUEST = 7001

  fun pause(context: Context, untilMs: Long) {
    val settings = NativeTrackingSettings(context)
    settings.pausedUntilMs = untilMs
    cancelAlarm(context)
    context.stopService(Intent(context, LocationService::class.java))
    LocationService.removeActivityUpdates(context)
    PlaceMonitor.unregister(context)
    if (untilMs != Long.MAX_VALUE) {
      scheduleResume(context, untilMs)
    }
    DiagLog.write(context, "pause.on", "until=$untilMs")
    repaintWidgets(context)
  }

  fun resume(context: Context) {
    val settings = NativeTrackingSettings(context)
    settings.pausedUntilMs = 0L
    cancelAlarm(context)
    if (settings.enabled) {
      val intent = Intent(context, LocationService::class.java)
        .putExtra(LocationService.EXTRA_SLOW_INTERVAL, settings.slowIntervalMs)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      PlaceMonitor.sync(context)
    }
    DiagLog.write(context, "pause.off", "enabled=${settings.enabled}")
    repaintWidgets(context)
  }

  /** Boot/foreground reconciliation: expire a lapsed timed pause, or re-arm the
   *  alarm for one still in the future (alarms don't survive reboot). */
  fun expireIfDue(context: Context) {
    val until = NativeTrackingSettings(context).pausedUntilMs
    val now = System.currentTimeMillis()
    when {
      until == 0L -> {}
      now >= until -> resume(context)
      until != Long.MAX_VALUE -> scheduleResume(context, until)
    }
  }

  /** Repaint the stop-tracking widget after a state change. */
  fun repaintWidgets(context: Context) {
    // wired in Task 6, when TrackingPauseWidgetProvider exists
  }

  private fun scheduleResume(context: Context, untilMs: Long) {
    val mgr = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    mgr.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, untilMs, alarmIntent(context))
  }

  private fun cancelAlarm(context: Context) {
    val mgr = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    mgr.cancel(alarmIntent(context))
  }

  private fun alarmIntent(context: Context): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      ALARM_REQUEST,
      Intent(context, TrackingResumeReceiver::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}
