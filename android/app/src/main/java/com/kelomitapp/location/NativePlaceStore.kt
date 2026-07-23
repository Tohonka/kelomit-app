package com.kelomitapp.location

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class NativePlace(
  val id: Long,
  val kind: String,
  val latitude: Double,
  val longitude: Double,
  val radiusM: Float,
)

class NativePlaceStore(context: Context) {
  companion object {
    private const val PREFS = "native-location-places"
    private const val KEY_PLACES = "places"
    private const val KEY_INSIDE_IDS = "inside_ids"
    private const val KEY_GENERATION = "generation"
  }

  private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun replace(places: List<NativePlace>) {
    val ids = places.mapTo(mutableSetOf()) { it.id }
    val keptInside = insideIds().intersect(ids)
    val encoded = JSONArray().apply {
      places.forEach { place ->
        put(JSONObject().apply {
          put("id", place.id)
          put("kind", place.kind)
          put("latitude", place.latitude)
          put("longitude", place.longitude)
          put("radiusM", place.radiusM.toDouble())
        })
      }
    }
    check(
      prefs.edit()
        .putString(KEY_PLACES, encoded.toString())
        .putString(KEY_INSIDE_IDS, encodeIds(keptInside))
        .putLong(KEY_GENERATION, prefs.getLong(KEY_GENERATION, 0L) + 1L)
        .commit(),
    ) { "Could not persist native places" }
  }

  fun all(): List<NativePlace> {
    val raw = prefs.getString(KEY_PLACES, null) ?: return emptyList()
    val array = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
    return buildList {
      for (index in 0 until array.length()) {
        val item = array.optJSONObject(index) ?: continue
        val place = runCatching {
          NativePlace(
            id = item.getLong("id"),
            kind = item.getString("kind"),
            latitude = item.getDouble("latitude"),
            longitude = item.getDouble("longitude"),
            radiusM = item.getDouble("radiusM").toFloat(),
          )
        }.getOrNull()
        if (place != null) add(place)
      }
    }
  }

  fun byId(id: Long): NativePlace? = all().firstOrNull { it.id == id }

  fun generation(): Long = prefs.getLong(KEY_GENERATION, 0L)

  fun insideIds(): Set<Long> {
    val raw = prefs.getString(KEY_INSIDE_IDS, null) ?: return emptySet()
    val array = runCatching { JSONArray(raw) }.getOrNull() ?: return emptySet()
    return buildSet {
      for (index in 0 until array.length()) {
        val id = array.optLong(index, Long.MIN_VALUE)
        if (id != Long.MIN_VALUE) add(id)
      }
    }
  }

  fun setInsideIds(ids: Set<Long>) {
    check(prefs.edit().putString(KEY_INSIDE_IDS, encodeIds(ids)).commit()) {
      "Could not persist native place membership"
    }
  }

  private fun encodeIds(ids: Set<Long>): String = JSONArray().apply {
    ids.sorted().forEach(::put)
  }.toString()
}
