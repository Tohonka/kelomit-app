package com.kelomitapp.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.TypedValue
import android.widget.RemoteViews
import android.widget.Toast
import com.kelomitapp.MainActivity
import com.kelomitapp.R
import org.json.JSONObject

const val ACTION_FOOD_ADD = "com.kelomitapp.widget.ACTION_FOOD_ADD"
const val EXTRA_FOOD_JSON = "food_json"

/**
 * Food widget: a scrolling list of the user's own foods (tap = "ate this,
 * now", no app launch), a search icon (opens the app's my-foods sheet) and a
 * barcode icon (FoodScanActivity). Taps are queued in FoodWidgetStore and
 * drained by JS — the widget never touches SQLite.
 */
class FoodWidgetProvider : AppWidgetProvider() {

  companion object {
    private const val CP_MAGNIFY = 0xF0349
    private const val CP_BARCODE = 0xF0072

    fun updateAll(context: Context) {
      val mgr = AppWidgetManager.getInstance(context) ?: return
      val ids = mgr.getAppWidgetIds(ComponentName(context, FoodWidgetProvider::class.java))
      for (id in ids) mgr.updateAppWidget(id, build(context))
      // The list rows come from the RemoteViewsFactory; tell it the data moved.
      mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_food_list)
    }

    private fun build(context: Context): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.widget_food)
      val px = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 22f, context.resources.displayMetrics).toInt()
      val tint = context.getColor(R.color.widget_text_primary)
      views.setImageViewBitmap(R.id.widget_food_search, HabitWidgetProvider.glyphBitmap(context, CP_MAGNIFY, tint, px))
      views.setImageViewBitmap(R.id.widget_food_scan, HabitWidgetProvider.glyphBitmap(context, CP_BARCODE, tint, px))

      views.setOnClickPendingIntent(R.id.widget_food_title, WidgetCommon.openAppPendingIntent(context))
      views.setOnClickPendingIntent(R.id.widget_food_search, deepLink(context, "kelomit://food/search", 0))
      views.setOnClickPendingIntent(
        R.id.widget_food_scan,
        PendingIntent.getActivity(
          context,
          1,
          Intent(context, FoodScanActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        ),
      )

      views.setRemoteAdapter(R.id.widget_food_list, Intent(context, FoodWidgetListService::class.java))
      views.setEmptyView(R.id.widget_food_list, R.id.widget_food_empty)
      views.setOnClickPendingIntent(R.id.widget_food_empty, WidgetCommon.openAppPendingIntent(context))
      // Rows fill in EXTRA_FOOD_JSON, so the template must be mutable.
      val template = Intent(context, FoodWidgetProvider::class.java).setAction(ACTION_FOOD_ADD)
      views.setPendingIntentTemplate(
        R.id.widget_food_list,
        PendingIntent.getBroadcast(
          context,
          2,
          template,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        ),
      )
      return views
    }

    internal fun deepLink(context: Context, url: String, requestCode: Int): PendingIntent {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        .setClass(context, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      return PendingIntent.getActivity(
        context,
        requestCode,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    internal fun toastAdded(context: Context, name: String) {
      Toast.makeText(
        context.applicationContext,
        context.getString(R.string.widget_food_added, name),
        Toast.LENGTH_SHORT,
      ).show()
    }
  }

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) appWidgetManager.updateAppWidget(id, build(context))
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action != ACTION_FOOD_ADD) return
    val food = intent.getStringExtra(EXTRA_FOOD_JSON)
      ?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return
    FoodWidgetStore.queue(context, food)
    toastAdded(context, food.optString("name"))
  }
}
