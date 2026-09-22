package com.kelomitapp.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import com.kelomitapp.R
import java.text.DateFormat
import java.util.Date

const val ACTION_NAG_DONE = "com.kelomitapp.widget.ACTION_NAG_DONE"

/**
 * Nag widget (plan 2026-09-22 T5): the next undone nag with a counting-down
 * chronometer to its due time and a Done button. Body tap opens the Nags tab.
 */
class NagWidgetProvider : AppWidgetProvider() {

  companion object {
    fun updateAll(context: Context) {
      val mgr = AppWidgetManager.getInstance(context) ?: return
      for (id in mgr.getAppWidgetIds(ComponentName(context, NagWidgetProvider::class.java))) {
        mgr.updateAppWidget(id, build(context, id))
      }
    }

    fun build(context: Context, appWidgetId: Int): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.widget_nag)
      val next = NagWidgetStore.getState(context)?.optJSONObject("next")
      val open = FoodWidgetProvider.deepLink(context, "kelomit://nags", 5_000_000 + appWidgetId)
      views.setOnClickPendingIntent(R.id.widget_nag_root, open)
      if (next == null) {
        views.setViewVisibility(R.id.widget_nag_empty, View.VISIBLE)
        views.setViewVisibility(R.id.widget_nag_body, View.GONE)
        return views
      }
      views.setViewVisibility(R.id.widget_nag_empty, View.GONE)
      views.setViewVisibility(R.id.widget_nag_body, View.VISIBLE)
      views.setTextViewText(R.id.widget_nag_title, next.optString("title"))

      val dueMs = next.optLong("due_ms", 0L)
      val overdue = dueMs <= System.currentTimeMillis()
      val timeText = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(dueMs))
      views.setTextViewText(
        R.id.widget_nag_due,
        context.getString(if (overdue) R.string.widget_nag_overdue else R.string.widget_nag_due_by, timeText),
      )
      // Chronometer wants an elapsedRealtime base; count down to the due instant.
      val showCountdown = next.optBoolean("countdown", true) && !overdue
      views.setViewVisibility(R.id.widget_nag_countdown, if (showCountdown) View.VISIBLE else View.GONE)
      if (showCountdown) {
        val base = SystemClock.elapsedRealtime() + (dueMs - System.currentTimeMillis())
        views.setChronometerCountDown(R.id.widget_nag_countdown, true)
        views.setChronometer(R.id.widget_nag_countdown, base, null, true)
      }
      views.setOnClickPendingIntent(R.id.widget_nag_done, donePendingIntent(context, appWidgetId))
      return views
    }

    private fun donePendingIntent(context: Context, appWidgetId: Int): PendingIntent {
      val intent = Intent(context, NagWidgetProvider::class.java).apply {
        action = ACTION_NAG_DONE
        data = Uri.parse("kelomit://nagwidget/$appWidgetId")
      }
      return PendingIntent.getBroadcast(
        context,
        5_100_000 + appWidgetId,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
  }

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) {
      appWidgetManager.updateAppWidget(id, build(context, id))
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ACTION_NAG_DONE) {
      NagWidgetStore.markDone(context)
      updateAll(context)
    }
  }
}
