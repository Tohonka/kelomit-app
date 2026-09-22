package com.kelomitapp.widget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * SharedPreferences behind the nag widget (plan 2026-09-22 T5). JS pushes the
 * next undone occurrence; the widget's Done button clears it locally and queues
 * it for the app to mark done (nag_done + a note) on its next foreground.
 *
 *   state   = { next: { nag_id, due_at, due_ms, title, countdown } | null }
 *   pending = [ { nag_id, due_at } ]
 */
object NagWidgetStore {
  private const val PREFS = "kelomit_nags"
  private const val KEY_STATE = "nag_state"
  private const val KEY_PENDING = "pending_dones"

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

  /** Widget Done: drop the shown occurrence and queue it. */
  fun markDone(context: Context) {
    val state = getState(context) ?: return
    val next = state.optJSONObject("next") ?: return
    val arr = runCatching { JSONArray(getPending(context)) }.getOrDefault(JSONArray())
    arr.put(JSONObject().apply {
      put("nag_id", next.optInt("nag_id"))
      put("due_at", next.optString("due_at"))
    })
    state.put("next", JSONObject.NULL)
    prefs(context).edit()
      .putString(KEY_STATE, state.toString())
      .putString(KEY_PENDING, arr.toString())
      .apply()
  }
}
