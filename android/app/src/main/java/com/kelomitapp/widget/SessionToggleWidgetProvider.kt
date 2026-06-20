package com.kelomitapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent

/**
 * Single-icon session widget (Phase 9.2, flavour a): a Philips-Hue-scene-style
 * button. One tap toggles the session start/stop using this widget's configured
 * project + tags.
 */
class SessionToggleWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) {
      appWidgetManager.updateAppWidget(id, WidgetCommon.buildToggle(context, id))
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
