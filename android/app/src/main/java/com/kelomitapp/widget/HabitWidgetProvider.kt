package com.kelomitapp.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import com.kelomitapp.R
import org.json.JSONObject

const val ACTION_HABIT_TOGGLE = "com.kelomitapp.widget.ACTION_HABIT_TOGGLE"
const val EXTRA_HABIT_ID = "com.kelomitapp.widget.HABIT_ID"

/**
 * Habit check-square widget (plan 2026-09-07). One resizable provider: the
 * slot count follows the width (1 per ~64dp, max 5), so a 1×1 placement is the
 * "small" widget and a wide one the "large" one. Each slot = habit icon (or
 * name) above a rounded square; tap flips today's state. Display data comes
 * from [HabitWidgetStore], pushed by JS.
 */
class HabitWidgetProvider : AppWidgetProvider() {

  companion object {
    const val MAX_SLOTS = 5
    private const val SLOT_DP = 64

    private val SLOT_IDS = intArrayOf(
      R.id.widget_habit_slot_1, R.id.widget_habit_slot_2, R.id.widget_habit_slot_3,
      R.id.widget_habit_slot_4, R.id.widget_habit_slot_5,
    )
    private val ICON_IDS = intArrayOf(
      R.id.widget_habit_icon_1, R.id.widget_habit_icon_2, R.id.widget_habit_icon_3,
      R.id.widget_habit_icon_4, R.id.widget_habit_icon_5,
    )
    private val NAME_IDS = intArrayOf(
      R.id.widget_habit_name_1, R.id.widget_habit_name_2, R.id.widget_habit_name_3,
      R.id.widget_habit_name_4, R.id.widget_habit_name_5,
    )
    private val SQUARE_IDS = intArrayOf(
      R.id.widget_habit_square_1, R.id.widget_habit_square_2, R.id.widget_habit_square_3,
      R.id.widget_habit_square_4, R.id.widget_habit_square_5,
    )

    // react-native-vector-icons' fonts.gradle bundles this TTF into the APK.
    @Volatile private var iconFont: Typeface? = null
    private fun font(context: Context): Typeface =
      iconFont ?: Typeface.createFromAsset(context.assets, "fonts/MaterialCommunityIcons.ttf").also { iconFont = it }

    fun updateAll(context: Context) {
      val mgr = AppWidgetManager.getInstance(context) ?: return
      for (id in mgr.getAppWidgetIds(ComponentName(context, HabitWidgetProvider::class.java))) {
        mgr.updateAppWidget(id, build(context, mgr, id))
      }
    }

    internal fun glyphBitmap(context: Context, codepoint: Int, color: Int, sizePx: Int): Bitmap {
      val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
      val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = font(context)
        textSize = sizePx * 0.9f
        this.color = color
        textAlign = Paint.Align.CENTER
      }
      val y = sizePx / 2f - (paint.descent() + paint.ascent()) / 2f
      Canvas(bmp).drawText(String(Character.toChars(codepoint)), sizePx / 2f, y, paint)
      return bmp
    }

    private fun habitColor(context: Context, hex: String?): Int =
      hex?.let { runCatching { Color.parseColor(it) }.getOrNull() } ?: context.getColor(R.color.widget_primary)

    fun build(context: Context, mgr: AppWidgetManager, appWidgetId: Int): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.widget_habits)
      val cfg = SessionStore.getConfig(context, appWidgetId)?.let { runCatching { JSONObject(it) }.getOrNull() }
      val ids = cfg?.optJSONArray("habit_ids")
      val showName = cfg?.optBoolean("show_name", false) ?: false
      val state = HabitWidgetStore.getState(context)
      val habits = state?.optJSONObject("habits")
      // Blob from an earlier day: nothing is done yet today.
      val stale = state?.optString("date") != HabitWidgetStore.today()

      val minWidth = mgr.getAppWidgetOptions(appWidgetId)
        .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, Int.MAX_VALUE)
      val slots = (minWidth / SLOT_DP).coerceIn(1, MAX_SLOTS)
      val density = context.resources.displayMetrics.density
      val iconPx = (26 * density).toInt()

      val empty = ids == null || ids.length() == 0 || habits == null
      views.setViewVisibility(R.id.widget_habits_empty, if (empty) View.VISIBLE else View.GONE)
      views.setOnClickPendingIntent(R.id.widget_habits_empty, WidgetCommon.openAppPendingIntent(context))

      // Visibility is set both ways on every slot: RemoteViews are re-applied on
      // resize and a one-sided GONE would stick.
      for (i in 0 until MAX_SLOTS) {
        val habitId = if (!empty && i < slots && i < ids!!.length()) ids.optInt(i, -1) else -1
        val h = habits?.optJSONObject(habitId.toString())
        if (habitId < 0 || h == null) {
          views.setViewVisibility(SLOT_IDS[i], View.GONE)
          continue
        }
        views.setViewVisibility(SLOT_IDS[i], View.VISIBLE)
        val color = habitColor(context, h.optString("color").takeIf { !h.isNull("color") && it.isNotBlank() })
        val done = !stale && h.optBoolean("done", false)

        views.setViewVisibility(NAME_IDS[i], if (showName) View.VISIBLE else View.GONE)
        views.setViewVisibility(ICON_IDS[i], if (showName) View.GONE else View.VISIBLE)
        views.setTextViewText(NAME_IDS[i], h.optString("title"))
        views.setTextColor(NAME_IDS[i], color)
        views.setImageViewBitmap(ICON_IDS[i], glyphBitmap(context, h.optInt("icon_cp", 0xF0766) /* circle-outline */, color, iconPx))

        // Off = hollow outline in the habit colour, on = solid fill. Both are
        // white shapes tinted through ImageView.setColorFilter (remotable).
        views.setImageViewResource(
          SQUARE_IDS[i],
          if (done) R.drawable.widget_habit_square_on else R.drawable.widget_habit_square,
        )
        views.setInt(SQUARE_IDS[i], "setColorFilter", if (done) color else (color and 0x00FFFFFF) or 0xAA000000.toInt())
        views.setOnClickPendingIntent(SLOT_IDS[i], togglePendingIntent(context, appWidgetId, i, habitId))
      }
      return views
    }

    private fun togglePendingIntent(context: Context, appWidgetId: Int, slot: Int, habitId: Int): PendingIntent {
      val intent = Intent(context, HabitWidgetProvider::class.java).apply {
        action = ACTION_HABIT_TOGGLE
        putExtra(EXTRA_HABIT_ID, habitId)
        // Unique per widget+slot so extras never coalesce across PendingIntents.
        data = Uri.parse("kelomit://habit/$appWidgetId/$slot")
      }
      return PendingIntent.getBroadcast(
        context,
        3_000_000 + appWidgetId * (MAX_SLOTS + 1) + slot,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
  }

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

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ACTION_HABIT_TOGGLE) {
      val habitId = intent.getIntExtra(EXTRA_HABIT_ID, -1)
      if (habitId >= 0) {
        HabitWidgetStore.toggle(context, habitId)
        updateAll(context)
      }
    }
  }

  override fun onDeleted(context: Context, appWidgetIds: IntArray) {
    for (id in appWidgetIds) {
      SessionStore.removeConfig(context, id)
    }
  }
}
