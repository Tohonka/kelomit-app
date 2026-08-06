package com.kelomitapp.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.widget.RemoteViews
import com.kelomitapp.MainActivity
import com.kelomitapp.R
import org.json.JSONObject
import java.time.Instant

/** Broadcast action a widget fires to start/stop the session. */
const val ACTION_TOGGLE = "com.kelomitapp.widget.ACTION_TOGGLE"
/** Broadcast action the full widget's pause/resume button fires. */
const val ACTION_PAUSE_RESUME = "com.kelomitapp.widget.ACTION_PAUSE_RESUME"
const val EXTRA_WIDGET_ID = "com.kelomitapp.widget.WIDGET_ID"

/**
 * Shared rendering + refresh helpers for both widget flavours. Keeping the
 * RemoteViews construction here means a session change (from a tap, or from the
 * app via [WidgetSessionModule]) repaints every placed widget the same way.
 */
object WidgetCommon {

  /** Re-render every placed widget of either flavour. Safe to call from RN. */
  fun updateAll(context: Context) {
    val mgr = AppWidgetManager.getInstance(context) ?: return
    for (id in mgr.getAppWidgetIds(ComponentName(context, SessionWidgetProvider::class.java))) {
      mgr.updateAppWidget(id, buildFull(context, id))
    }
    for (id in mgr.getAppWidgetIds(ComponentName(context, SessionToggleWidgetProvider::class.java))) {
      mgr.updateAppWidget(id, buildToggle(context, id))
    }
  }

  /** PendingIntent that fires [ACTION_TOGGLE] for a specific widget. */
  fun togglePendingIntent(context: Context, providerClass: Class<*>, appWidgetId: Int): PendingIntent {
    val intent = Intent(context, providerClass).apply {
      action = ACTION_TOGGLE
      putExtra(EXTRA_WIDGET_ID, appWidgetId)
      // Make the intent unique per widget so extras aren't coalesced.
      data = android.net.Uri.parse("kelomit://widget/$appWidgetId")
    }
    return PendingIntent.getBroadcast(
      context,
      appWidgetId,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun openAppPendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    return PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  /** PendingIntent that fires [ACTION_PAUSE_RESUME] for a specific widget. */
  fun pausePendingIntent(context: Context, appWidgetId: Int): PendingIntent {
    val intent = Intent(context, SessionWidgetProvider::class.java).apply {
      action = ACTION_PAUSE_RESUME
      putExtra(EXTRA_WIDGET_ID, appWidgetId)
      data = android.net.Uri.parse("kelomit://widget-pause/$appWidgetId")
    }
    return PendingIntent.getBroadcast(
      context,
      1_000_000 + appWidgetId,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  fun isPaused(active: JSONObject?): Boolean =
    active != null && !active.isNull("paused_at") && active.optString("paused_at").isNotEmpty()

  /** Total tracked ms: closed segments + running one. Pauses excluded. */
  fun totalElapsedMillis(active: JSONObject?): Long? {
    if (active == null) return null
    val acc = active.optLong("accumulated_ms", 0L)
    if (isPaused(active)) return acc
    val startMs = runCatching {
      Instant.parse(active.optString("started_at")).toEpochMilli()
    }.getOrNull() ?: return acc
    return acc + (System.currentTimeMillis() - startMs).coerceAtLeast(0)
  }

  private fun activeJson(context: Context): JSONObject? =
    SessionStore.getActive(context)?.let { runCatching { JSONObject(it) }.getOrNull() }

  // ── Full-width widget (b): Chronometer + Start/Stop ─────────────────────────

  fun buildFull(context: Context, appWidgetId: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_session)
    val active = activeJson(context)
    val total = totalElapsedMillis(active)
    val paused = isPaused(active)
    val cfg = SessionStore.getConfig(context, appWidgetId)
      ?.let { runCatching { JSONObject(it) }.getOrNull() }
    val configName = cfg?.optString("name")?.takeIf { it.isNotBlank() }
    val sessionName = active?.optString("name")?.takeIf { it.isNotBlank() }

    if (active != null && total != null) {
      val base = SystemClock.elapsedRealtime() - total
      views.setChronometer(R.id.widget_chrono, base, null, !paused)
      views.setViewVisibility(R.id.widget_chrono, android.view.View.VISIBLE)
      views.setViewVisibility(R.id.widget_idle_label, android.view.View.GONE)
      views.setTextViewText(R.id.widget_button, context.getString(R.string.widget_stop))
      views.setTextViewText(
        R.id.widget_status,
        sessionName ?: context.getString(
          if (paused) R.string.widget_paused else R.string.widget_tracking),
      )
      views.setViewVisibility(R.id.widget_pause_button, android.view.View.VISIBLE)
      views.setTextViewText(
        R.id.widget_pause_button,
        context.getString(if (paused) R.string.widget_resume else R.string.widget_pause),
      )
    } else {
      views.setChronometer(R.id.widget_chrono, SystemClock.elapsedRealtime(), null, false)
      views.setViewVisibility(R.id.widget_chrono, android.view.View.GONE)
      views.setViewVisibility(R.id.widget_idle_label, android.view.View.VISIBLE)
      views.setTextViewText(R.id.widget_button, context.getString(R.string.widget_start))
      views.setTextViewText(
        R.id.widget_status,
        configName ?: context.getString(R.string.widget_title),
      )
      views.setViewVisibility(R.id.widget_pause_button, android.view.View.GONE)
    }

    views.setOnClickPendingIntent(
      R.id.widget_button,
      togglePendingIntent(context, SessionWidgetProvider::class.java, appWidgetId),
    )
    views.setOnClickPendingIntent(R.id.widget_pause_button, pausePendingIntent(context, appWidgetId))
    views.setOnClickPendingIntent(R.id.widget_root, openAppPendingIntent(context))
    return views
  }

  // ── Single-icon widget (a): tap toggles ─────────────────────────────────────

  fun buildToggle(context: Context, appWidgetId: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_session_toggle)
    val running = SessionStore.getActive(context) != null
    views.setImageViewResource(
      R.id.widget_toggle_icon,
      if (running) R.drawable.ic_widget_stop else R.drawable.ic_widget_play,
    )
    val cfgName = SessionStore.getConfig(context, appWidgetId)
      ?.let { runCatching { JSONObject(it) }.getOrNull() }
      ?.optString("name")?.takeIf { it.isNotBlank() }
    views.setTextViewText(
      R.id.widget_toggle_label,
      if (running) context.getString(R.string.widget_stop)
      else cfgName ?: context.getString(R.string.widget_start),
    )
    views.setInt(
      R.id.widget_toggle_root,
      "setBackgroundResource",
      if (running) R.drawable.widget_bg_active else R.drawable.widget_bg,
    )
    views.setOnClickPendingIntent(
      R.id.widget_toggle_root,
      togglePendingIntent(context, SessionToggleWidgetProvider::class.java, appWidgetId),
    )
    return views
  }
}
