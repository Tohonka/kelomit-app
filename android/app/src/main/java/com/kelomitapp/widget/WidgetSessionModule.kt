package com.kelomitapp.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.kelomitapp.location.TrackingPauseWidgetProvider
import org.json.JSONArray
import org.json.JSONObject

/**
 * JS bridge over [SessionStore] (Phase 9.2). Lets the React Native app read and
 * write the SAME native session/config that the home-screen widgets use, so the
 * in-app quick timer and the widgets share one source of truth. Values cross the
 * bridge as JSON strings to keep marshalling trivial and identical to the JS
 * shapes.
 */
class WidgetSessionModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "WidgetSession"

  private val context get() = reactApplicationContext

  // ── Active session ─────────────────────────────────────────────────────────

  @ReactMethod
  fun getActiveSession(promise: Promise) {
    promise.resolve(SessionStore.getActive(context))
  }

  @ReactMethod
  fun setActiveSession(json: String, promise: Promise) {
    SessionStore.setActive(context, json)
    WidgetCommon.updateAll(context)
    promise.resolve(null)
  }

  @ReactMethod
  fun clearActiveSession(promise: Promise) {
    SessionStore.clearActive(context)
    WidgetCommon.updateAll(context)
    promise.resolve(null)
  }

  // ── Pending queue (completed sessions awaiting a note) ──────────────────────

  @ReactMethod
  fun getPendingSessions(promise: Promise) {
    promise.resolve(SessionStore.getPending(context))
  }

  @ReactMethod
  fun clearPendingSessions(promise: Promise) {
    SessionStore.clearPending(context)
    promise.resolve(null)
  }

  // ── Per-widget config ───────────────────────────────────────────────────────

  @ReactMethod
  fun setWidgetConfig(appWidgetId: Double, json: String, promise: Promise) {
    SessionStore.setConfig(context, appWidgetId.toInt(), json)
    WidgetCommon.updateAll(context)
    promise.resolve(null)
  }

  /**
   * All currently-placed widgets with their config, as a JSON array of
   * { appWidgetId, type ('toggle'|'full'), config }. Powers the in-app
   * "Widgets" settings screen.
   */
  @ReactMethod
  fun getWidgets(promise: Promise) {
    val mgr = AppWidgetManager.getInstance(context)
    val out = JSONArray()
    if (mgr == null) {
      promise.resolve(out.toString())
      return
    }
    fun collect(type: String, cls: Class<*>) {
      for (id in mgr.getAppWidgetIds(ComponentName(context, cls))) {
        val entry = JSONObject().apply {
          put("appWidgetId", id)
          put("type", type)
          val cfg = SessionStore.getConfig(context, id)
          put("config", if (cfg != null) JSONObject(cfg) else JSONObject.NULL)
        }
        out.put(entry)
      }
    }
    collect("toggle", SessionToggleWidgetProvider::class.java)
    collect("full", SessionWidgetProvider::class.java)
    promise.resolve(out.toString())
  }

  @ReactMethod
  fun refreshWidgets(promise: Promise) {
    WidgetCommon.updateAll(context)
    promise.resolve(null)
  }

  /**
   * Ask the launcher to place a new widget (API 26+ pin flow). Resolves false
   * when the launcher doesn't support pinning — the caller shows a hint to add
   * it from the home screen instead. The launcher's own dialog handles the rest;
   * the new widget shows up in getWidgets() once placed.
   */
  @ReactMethod
  fun requestPinWidget(type: String, promise: Promise) {
    val mgr = AppWidgetManager.getInstance(context)
    val cls = when (type) {
      "toggle" -> SessionToggleWidgetProvider::class.java
      "addnote" -> AddNoteWidgetProvider::class.java
      "tracking" -> TrackingPauseWidgetProvider::class.java
      else -> SessionWidgetProvider::class.java
    }
    val ok = mgr != null &&
      mgr.isRequestPinAppWidgetSupported &&
      mgr.requestPinAppWidget(ComponentName(context, cls), null, null)
    promise.resolve(ok)
  }
}
