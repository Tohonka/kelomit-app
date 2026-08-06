package com.kelomitapp.location

import android.app.AlarmManager
import android.app.ForegroundServiceStartNotAllowedException
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

  /** JS cannot pass Long.MAX_VALUE through a Double; 2^62 is the agreed
   *  "until resumed" sentinel and round-trips exactly. Anything at or above
   *  it means indefinite. */
  const val INDEFINITE_PAUSE_MS = 1L shl 62

  fun pause(context: Context, untilMs: Long) {
    val settings = NativeTrackingSettings(context)
    settings.pausedUntilMs = untilMs
    cancelAlarm(context)
    context.stopService(Intent(context, LocationService::class.java))
    LocationService.removeActivityUpdates(context)
    PlaceMonitor.unregister(context).addOnFailureListener {
      DiagLog.write(context, "pause.unregister.fail", it.javaClass.simpleName)
    }
    if (untilMs < INDEFINITE_PAUSE_MS) {
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
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      } catch (error: ForegroundServiceStartNotAllowedException) {
        DiagLog.write(context, "pause.resume.fail", error.javaClass.simpleName)
      } catch (error: SecurityException) {
        DiagLog.write(context, "pause.resume.fail", error.javaClass.simpleName)
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
      until < INDEFINITE_PAUSE_MS -> scheduleResume(context, until)
    }
  }

  /** Repaint the stop-tracking widget after a state change. */
  fun repaintWidgets(context: Context) {
    // wired in Task 6, when TrackingPauseWidgetProvider exists
  }

  /** Prefer an exact alarm: the background-FGS-start exemption only covers
   *  exact alarms, so an inexact one can wake us without letting [resume]
   *  start the foreground service. Falls back to inexact below API 31 (where
   *  it needs no permission and this call always succeeds) and whenever
   *  SCHEDULE_EXACT_ALARM isn't granted. */
  private fun scheduleResume(context: Context, untilMs: Long) {
    val mgr = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val intent = alarmIntent(context)
    val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || mgr.canScheduleExactAlarms()
    if (canExact) {
      try {
        mgr.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, untilMs, intent)
        DiagLog.write(context, "pause.alarm.exact", "until=$untilMs")
        return
      } catch (error: SecurityException) {
        // Permission state can change between the check and the call.
        DiagLog.write(context, "pause.alarm.fallback", error.javaClass.simpleName)
      }
    }
    mgr.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, untilMs, intent)
    DiagLog.write(context, "pause.alarm.inexact", "until=$untilMs")
  }

  private fun cancelAlarm(context: Context) {
    val mgr = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val pending = PendingIntent.getBroadcast(
      context,
      ALARM_REQUEST,
      Intent(context, TrackingResumeReceiver::class.java),
      PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
    ) ?: return
    mgr.cancel(pending)
  }

  private fun alarmIntent(context: Context): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      ALARM_REQUEST,
      Intent(context, TrackingResumeReceiver::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}
