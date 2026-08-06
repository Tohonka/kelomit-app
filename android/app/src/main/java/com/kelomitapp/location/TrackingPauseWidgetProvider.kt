package com.kelomitapp.location

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import com.kelomitapp.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

const val ACTION_TRACKING_PAUSE_1H = "com.kelomitapp.widget.ACTION_TRACKING_PAUSE_1H"
const val ACTION_TRACKING_PAUSE_4H = "com.kelomitapp.widget.ACTION_TRACKING_PAUSE_4H"
const val ACTION_TRACKING_PAUSE_INF = "com.kelomitapp.widget.ACTION_TRACKING_PAUSE_INF"
const val ACTION_TRACKING_RESUME = "com.kelomitapp.widget.ACTION_TRACKING_RESUME"

/**
 * Stop-tracking widget: pause all movement detection for 1 h / 4 h / until
 * resumed, and resume it. State lives in NativeTrackingSettings.pausedUntilMs
 * (single source of truth shared with the settings screen and JS).
 */
class TrackingPauseWidgetProvider : AppWidgetProvider() {

  companion object {
    private const val HOUR_MS = 60L * 60 * 1000

    fun updateAll(context: Context) {
      val mgr = AppWidgetManager.getInstance(context) ?: return
      val ids = mgr.getAppWidgetIds(ComponentName(context, TrackingPauseWidgetProvider::class.java))
      for (id in ids) {
        mgr.updateAppWidget(id, build(context))
      }
    }

    private fun build(context: Context): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.widget_tracking_pause)
      val settings = NativeTrackingSettings(context)
      val until = settings.pausedUntilMs
      val paused = settings.isPaused()

      when {
        !settings.enabled -> {
          views.setTextViewText(R.id.widget_pause_status, context.getString(R.string.widget_tracking_off))
          views.setViewVisibility(R.id.widget_pause_presets, View.GONE)
          views.setViewVisibility(R.id.widget_pause_resume, View.GONE)
        }
        paused -> {
          // JS can't pass Long.MAX_VALUE through a Double, so the agreed
          // "until resumed" sentinel is TrackingPause.INDEFINITE_PAUSE_MS
          // (2^62); compare with >= so the tolerated Long.MAX_VALUE also
          // renders as indefinite instead of a bogus date.
          val label =
            if (until >= TrackingPause.INDEFINITE_PAUSE_MS) {
              context.getString(R.string.widget_paused_indefinitely)
            } else {
              context.getString(
                R.string.widget_paused_until,
                SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(until)),
              )
            }
          views.setTextViewText(R.id.widget_pause_status, label)
          views.setViewVisibility(R.id.widget_pause_presets, View.GONE)
          views.setViewVisibility(R.id.widget_pause_resume, View.VISIBLE)
        }
        else -> {
          views.setTextViewText(R.id.widget_pause_status, context.getString(R.string.widget_tracking_on))
          views.setViewVisibility(R.id.widget_pause_presets, View.VISIBLE)
          views.setViewVisibility(R.id.widget_pause_resume, View.GONE)
        }
      }

      views.setOnClickPendingIntent(R.id.widget_pause_1h, broadcast(context, ACTION_TRACKING_PAUSE_1H, 0))
      views.setOnClickPendingIntent(R.id.widget_pause_4h, broadcast(context, ACTION_TRACKING_PAUSE_4H, 1))
      views.setOnClickPendingIntent(R.id.widget_pause_inf, broadcast(context, ACTION_TRACKING_PAUSE_INF, 2))
      views.setOnClickPendingIntent(R.id.widget_pause_resume, broadcast(context, ACTION_TRACKING_RESUME, 3))
      return views
    }

    private fun broadcast(context: Context, action: String, requestCode: Int): PendingIntent =
      PendingIntent.getBroadcast(
        context,
        requestCode,
        Intent(context, TrackingPauseWidgetProvider::class.java).setAction(action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
  }

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) {
      appWidgetManager.updateAppWidget(id, build(context))
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    val enabled = NativeTrackingSettings(context).enabled
    val now = System.currentTimeMillis()
    when (intent.action) {
      ACTION_TRACKING_PAUSE_1H -> if (enabled) TrackingPause.pause(context, now + HOUR_MS)
      ACTION_TRACKING_PAUSE_4H -> if (enabled) TrackingPause.pause(context, now + 4 * HOUR_MS)
      ACTION_TRACKING_PAUSE_INF -> if (enabled) TrackingPause.pause(context, TrackingPause.INDEFINITE_PAUSE_MS)
      ACTION_TRACKING_RESUME -> TrackingPause.resume(context)
    }
  }
}
