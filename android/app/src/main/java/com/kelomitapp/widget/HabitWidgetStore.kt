package com.kelomitapp.widget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/**
 * SharedPreferences behind the habit widget (plan 2026-09-07). Mirrors the
 * SessionStore split: JS pushes the display blob, widget taps mutate it locally
 * and queue toggles for the app to fold into habit_day_overrides.
 *
 *   state   = { date, habits: { "<habitId>": { done, title, icon_cp, color } } }
 *   pending = [ { habit_id, date, done } ]
 */
object HabitWidgetStore {
  private const val PREFS = "kelomit_habits"
  private const val KEY_STATE = "habit_state"
  private const val KEY_PENDING = "pending_toggles"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun getState(context: Context): JSONObject? =
    prefs(context).getString(KEY_STATE, null)?.let { runCatching { JSONObject(it) }.getOrNull() }

  fun setState(context: Context, json: String?) {
    prefs(context).edit().apply {
      if (json.isNullOrBlank()) remove(KEY_STATE) else putString(KEY_STATE, json)
    }.apply()
  }

  fun getPending(context: Context): String = prefs(context).getString(KEY_PENDING, "[]") ?: "[]"

  fun clearPending(context: Context) = prefs(context).edit().remove(KEY_PENDING).apply()

  fun today(): String = LocalDate.now().toString()

  /**
   * Widget tap: flip the habit's `done` for today and queue it. A blob pushed
   * on an earlier day is first reset (every habit off) — the app hasn't run
   * since midnight, so nothing can be done yet today.
   */
  fun toggle(context: Context, habitId: Int) {
    val state = getState(context) ?: return
    val habits = state.optJSONObject("habits") ?: return
    val today = today()
    if (state.optString("date") != today) {
      for (k in habits.keys()) habits.optJSONObject(k)?.put("done", false)
      state.put("date", today)
    }
    val h = habits.optJSONObject(habitId.toString()) ?: return
    val next = !h.optBoolean("done", false)
    h.put("done", next)
    setState(context, state.toString())
    val arr = runCatching { JSONArray(getPending(context)) }.getOrDefault(JSONArray())
    arr.put(JSONObject().apply {
      put("habit_id", habitId)
      put("date", today)
      put("done", next)
    })
    prefs(context).edit().putString(KEY_PENDING, arr.toString()).apply()
  }
}
