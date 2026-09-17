package com.kelomitapp.widget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/**
 * SharedPreferences behind the food widget (plan 2026-09-17 T7). Same split as
 * the habit widget: JS pushes what to show, native queues what was tapped and
 * JS folds the queue into food_entries the next time it runs.
 *
 *   state   = { foods: [ template ], barcodes: { "<code>": template } }
 *   template = { name, kcal, product_id, quantity, unit }   (nullable but name)
 *   pending = [ { ...template, eaten_at, barcode? } ]
 */
object FoodWidgetStore {
  private const val PREFS = "kelomit_food"
  private const val KEY_STATE = "food_state"
  private const val KEY_PENDING = "pending_adds"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun state(context: Context): JSONObject? =
    prefs(context).getString(KEY_STATE, null)?.let { runCatching { JSONObject(it) }.getOrNull() }

  fun setState(context: Context, json: String?) {
    prefs(context).edit().apply {
      if (json.isNullOrBlank()) remove(KEY_STATE) else putString(KEY_STATE, json)
    }.apply()
  }

  fun foods(context: Context): JSONArray = state(context)?.optJSONArray("foods") ?: JSONArray()

  fun byBarcode(context: Context, code: String): JSONObject? =
    state(context)?.optJSONObject("barcodes")?.optJSONObject(code)

  fun getPending(context: Context): String = prefs(context).getString(KEY_PENDING, "[]") ?: "[]"

  fun clearPending(context: Context) = prefs(context).edit().remove(KEY_PENDING).apply()

  /** Queue "ate this, now". `barcode` rides along for a scan the app must still resolve. */
  fun queue(context: Context, template: JSONObject, barcode: String? = null) {
    val arr = runCatching { JSONArray(getPending(context)) }.getOrDefault(JSONArray())
    // Copy: the template object belongs to the state blob.
    val item = JSONObject(template.toString()).apply {
      put("eaten_at", Instant.now().toString())
      if (barcode != null) put("barcode", barcode)
    }
    arr.put(item)
    prefs(context).edit().putString(KEY_PENDING, arr.toString()).apply()
  }
}
