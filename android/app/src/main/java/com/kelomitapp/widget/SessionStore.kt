package com.kelomitapp.widget

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/**
 * SharedPreferences-backed single source of truth for the active time-tracking
 * session (Iteration 3 Phase 9.2). It is readable/writable both from the React
 * Native app (via [WidgetSessionModule]) and from the home-screen widgets while
 * RN is NOT running — that's the whole point of keeping it native.
 *
 * Shapes mirror the JS side (`src/types ActiveSession`, `src/native/widgetSession`):
 *   active  = { started_at, project_id, activity_type, tags[], title, source,
 *               name, accumulated_ms, paused_at }
 *   pending = [ { started_at, ended_at, project_id, activity_type, tags[], title, name } ]
 *   config  = { project_id, activity_type, tags[], name }   (per appWidgetId)
 *
 * name/accumulated_ms/paused_at are absent on a session persisted by an older
 * build — always read them with opt*, never assume they exist.
 *
 * On stop the finished session is pushed to `pending`; the app drains that queue
 * into a normal note entry the next time it runs.
 */
object SessionStore {
  private const val PREFS = "kelomit_session"
  private const val KEY_ACTIVE = "active_session"
  private const val KEY_PENDING = "pending_sessions"
  private const val KEY_CONFIG_PREFIX = "widget_cfg_"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  // ── Active session ─────────────────────────────────────────────────────────

  /** Raw JSON of the active session, or null when nothing is running. */
  fun getActive(context: Context): String? {
    val raw = prefs(context).getString(KEY_ACTIVE, null)
    return if (raw.isNullOrBlank()) null else raw
  }

  fun setActive(context: Context, json: String?) {
    prefs(context).edit().apply {
      if (json.isNullOrBlank()) remove(KEY_ACTIVE) else putString(KEY_ACTIVE, json)
    }.apply()
  }

  fun clearActive(context: Context) = setActive(context, null)

  // ── Pending (completed, awaiting drain into a note) ─────────────────────────

  fun getPending(context: Context): String {
    return prefs(context).getString(KEY_PENDING, "[]") ?: "[]"
  }

  fun clearPending(context: Context) {
    prefs(context).edit().remove(KEY_PENDING).apply()
  }

  private fun pushPending(context: Context, completed: JSONObject) {
    val arr = try {
      JSONArray(getPending(context))
    } catch (e: Exception) {
      JSONArray()
    }
    arr.put(completed)
    prefs(context).edit().putString(KEY_PENDING, arr.toString()).apply()
  }

  // ── Per-widget config (project + tags chosen in-app) ────────────────────────

  fun getConfig(context: Context, appWidgetId: Int): String? {
    val raw = prefs(context).getString(KEY_CONFIG_PREFIX + appWidgetId, null)
    return if (raw.isNullOrBlank()) null else raw
  }

  fun setConfig(context: Context, appWidgetId: Int, json: String?) {
    prefs(context).edit().apply {
      val key = KEY_CONFIG_PREFIX + appWidgetId
      if (json.isNullOrBlank()) remove(key) else putString(key, json)
    }.apply()
  }

  fun removeConfig(context: Context, appWidgetId: Int) = setConfig(context, appWidgetId, null)

  // ── Toggle (called from a widget tap, RN may be dead) ───────────────────────

  /**
   * Start or stop the single global session. Starting pulls project/activity/tags
   * from the tapping widget's config (if any). Returns true if a session is now
   * running, false if it was just stopped (and queued for draining).
   */
  fun toggle(context: Context, appWidgetId: Int): Boolean {
    val active = getActive(context)
    return if (active != null) {
      val json = runCatching { JSONObject(active) }.getOrNull()
      if (json != null && !json.isNull("paused_at") && json.optString("paused_at").isNotEmpty()) {
        clearActive(context) // segment already landed at pause time
      } else {
        stopInternal(context, active)
      }
      false
    } else {
      startInternal(context, appWidgetId)
      true
    }
  }

  private fun startInternal(context: Context, appWidgetId: Int) {
    val cfg = getConfig(context, appWidgetId)?.let { runCatching { JSONObject(it) }.getOrNull() }
    val session = JSONObject().apply {
      put("started_at", Instant.now().toString())
      put("project_id", cfg?.opt("project_id") ?: JSONObject.NULL)
      put("activity_type", cfg?.optString("activity_type", "work") ?: "work")
      put("tags", cfg?.optJSONArray("tags") ?: JSONArray())
      put("title", JSONObject.NULL)
      put("source", "widget")
      put("name", cfg?.opt("name") ?: JSONObject.NULL)
      put("accumulated_ms", 0L)
      put("paused_at", JSONObject.NULL)
    }
    setActive(context, session.toString())
  }

  private fun stopInternal(context: Context, activeJson: String) {
    val active = runCatching { JSONObject(activeJson) }.getOrNull()
    if (active != null) {
      val completed = JSONObject().apply {
        put("started_at", active.optString("started_at"))
        put("ended_at", Instant.now().toString())
        put("project_id", active.opt("project_id") ?: JSONObject.NULL)
        put("activity_type", active.optString("activity_type", "work"))
        put("tags", active.optJSONArray("tags") ?: JSONArray())
        put("title", active.opt("title") ?: JSONObject.NULL)
        put("name", active.opt("name") ?: JSONObject.NULL)
      }
      pushPending(context, completed)
    }
    clearActive(context)
  }

  /** Pause a running session (segment → pending) or resume a paused one. */
  fun pauseResume(context: Context) {
    val raw = getActive(context) ?: return
    val active = runCatching { JSONObject(raw) }.getOrNull() ?: return
    val paused = !active.isNull("paused_at") && active.optString("paused_at").isNotEmpty()
    if (paused) {
      active.put("started_at", Instant.now().toString())
      active.put("paused_at", JSONObject.NULL)
    } else {
      val startedMs = runCatching {
        Instant.parse(active.optString("started_at")).toEpochMilli()
      }.getOrNull()
      if (startedMs == null) {
        // Unparseable started_at: bail with no state change rather than pause into
        // a broken segment. Logged so a stuck pause button is diagnosable on device.
        Log.w("KelomitWidget", "pauseResume: unparseable started_at, ignoring tap")
        return
      }
      // Single clock read for this whole pause: segment length, ended_at and
      // paused_at must all agree to the millisecond.
      val now = Instant.now()
      val segmentMs = (now.toEpochMilli() - startedMs).coerceAtLeast(0)
      // Drop segments under MIN_SESSION_SECONDS, same as src/services/sessionService.ts
      // pauseSession — but still fold the elapsed time into accumulated_ms below.
      if (segmentMs >= 1000L) {
        // Same shape stopInternal pushes — the app drains it into a note.
        val completed = JSONObject().apply {
          put("started_at", active.optString("started_at"))
          put("ended_at", now.toString())
          put("project_id", active.opt("project_id") ?: JSONObject.NULL)
          put("activity_type", active.optString("activity_type", "work"))
          put("tags", active.optJSONArray("tags") ?: JSONArray())
          put("title", active.opt("title") ?: JSONObject.NULL)
          put("name", active.opt("name") ?: JSONObject.NULL)
        }
        pushPending(context, completed)
      }
      active.put("accumulated_ms", active.optLong("accumulated_ms", 0L) + segmentMs)
      active.put("paused_at", now.toString())
    }
    setActive(context, active.toString())
  }
}
