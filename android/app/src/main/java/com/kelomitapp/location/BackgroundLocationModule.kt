package com.kelomitapp.location

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.kelomitapp.BuildConfig

/**
 * JS bridge to start/stop the background-location foreground service
 * ([LocationService]). Called from `App.tsx` on background/foreground
 * transitions when the user has enabled "Track in background".
 */
class BackgroundLocationModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "BackgroundLocation"

  // Expose the build-time Google Maps key (from .maps.env) to JS so the Places
  // lookup reuses the same key instead of storing a copy in the app database.
  override fun getConstants(): Map<String, Any> = mapOf("mapsApiKey" to BuildConfig.MAPS_API_KEY)

  @ReactMethod
  fun start(promise: Promise) {
    try {
      val ctx = reactApplicationContext
      val intent = Intent(ctx, LocationService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ctx.startForegroundService(intent)
      } else {
        ctx.startService(intent)
      }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("start_failed", e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      val ctx = reactApplicationContext
      ctx.stopService(Intent(ctx, LocationService::class.java))
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("stop_failed", e)
    }
  }

  @ReactMethod
  fun setMode(mode: String, ms: Double, promise: Promise) {
    try {
      // Talk to the already-running service in-process; do NOT startForegroundService
      // here (forbidden from background on Android 12+).
      LocationService.instance?.updateMode(mode, ms.toLong())
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("set_mode_failed", e)
    }
  }

  @ReactMethod
  fun enterParked(fences: ReadableArray, promise: Promise) {
    try {
      val parsed = (0 until fences.size()).mapNotNull { i ->
        val f = fences.getMap(i) ?: return@mapNotNull null
        LocationService.ParkFence(
          id = f.getDouble("id").toLong(),
          latitude = f.getDouble("latitude"),
          longitude = f.getDouble("longitude"),
          radiusM = f.getDouble("radius").toFloat(),
        )
      }
      LocationService.instance?.enterParked(parsed)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("enter_parked_failed", e)
    }
  }

  /** Drain fixes buffered while the React context was dead (see
   *  [LocationService.FIX_BUFFER_FILE]): return the JSONL lines and delete the
   *  file. JS feeds them through its normal persistence pipeline. */
  @ReactMethod
  fun drainFixBuffer(promise: Promise) {
    try {
      val file = java.io.File(reactApplicationContext.filesDir, LocationService.FIX_BUFFER_FILE)
      val out = com.facebook.react.bridge.Arguments.createArray()
      if (file.exists()) {
        file.readLines().forEach { line -> if (line.isNotBlank()) out.pushString(line) }
        file.delete()
      }
      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject("drain_fix_buffer_failed", e)
    }
  }

  @ReactMethod
  fun monitorPlaces(places: ReadableArray, promise: Promise) {
    try {
      val parsed = (0 until places.size()).mapNotNull { i ->
        val f = places.getMap(i) ?: return@mapNotNull null
        LocationService.ParkFence(
          id = f.getDouble("id").toLong(),
          latitude = f.getDouble("latitude"),
          longitude = f.getDouble("longitude"),
          radiusM = f.getDouble("radius").toFloat(),
        )
      }
      LocationService.instance?.monitorPlaces(parsed)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("monitor_places_failed", e)
    }
  }
}
