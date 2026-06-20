package com.kelomitapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent

/**
 * Full-width session widget (Phase 9.2, flavour b): a live Chronometer plus a
 * Start/Stop button. Reflects the single global session, whichever surface
 * started it.
 */
class SessionWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) {
      appWidgetManager.updateAppWidget(id, WidgetCommon.buildFull(context, id))
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ACTION_TOGGLE) {
      val id = intent.getIntExtra(EXTRA_WIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
      SessionStore.toggle(context, id)
      WidgetCommon.updateAll(context)
    }
  }

  override fun onDeleted(context: Context, appWidgetIds: IntArray) {
    for (id in appWidgetIds) {
      SessionStore.removeConfig(context, id)
    }
  }
}
