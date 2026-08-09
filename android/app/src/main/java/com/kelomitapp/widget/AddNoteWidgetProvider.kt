package com.kelomitapp.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.RemoteViews
import com.kelomitapp.MainActivity
import com.kelomitapp.R

/**
 * One-row quick-capture widget: Note / Photo / Voice. Each button deep-links
 * into the app (`kelomit://quickadd/<type>`), which opens the quick-add screen
 * and auto-starts the camera/recorder — the fast path the widget exists for.
 */
class AddNoteWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) {
      appWidgetManager.updateAppWidget(id, build(context, appWidgetManager, id))
    }
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle,
  ) {
    appWidgetManager.updateAppWidget(appWidgetId, build(context, appWidgetManager, appWidgetId))
  }

  private fun build(context: Context, mgr: AppWidgetManager, appWidgetId: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_add_note)
    views.setOnClickPendingIntent(R.id.widget_addnote_note, quickAddIntent(context, "note", 0))
    views.setOnClickPendingIntent(R.id.widget_addnote_photo, quickAddIntent(context, "photo", 1))
    views.setOnClickPendingIntent(R.id.widget_addnote_voice, quickAddIntent(context, "voice", 2))

    // Narrow widget: keep the icons, drop the labels.
    val minWidth = mgr.getAppWidgetOptions(appWidgetId)
      .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, Int.MAX_VALUE)
    val labelVisibility =
      if (minWidth < WidgetCommon.COMPACT_WIDTH_DP) android.view.View.GONE
      else android.view.View.VISIBLE
    views.setViewVisibility(R.id.widget_addnote_note_label, labelVisibility)
    views.setViewVisibility(R.id.widget_addnote_photo_label, labelVisibility)
    views.setViewVisibility(R.id.widget_addnote_voice_label, labelVisibility)
    return views
  }

  private fun quickAddIntent(context: Context, type: String, requestCode: Int): PendingIntent {
    // Explicit activity intent with a per-type data URI, so the three
    // PendingIntents never coalesce (filterEquals differs by data).
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("kelomit://quickadd/$type"))
      .setClass(context, MainActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}
