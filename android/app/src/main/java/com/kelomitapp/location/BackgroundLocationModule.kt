package com.kelomitapp.location

import android.content.Intent
import android.os.Build
import android.util.AtomicFile
import com.facebook.react.bridge.Arguments
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
  fun start(slowIntervalMs: Double, promise: Promise) {
    try {
      require(slowIntervalMs.isFinite() && slowIntervalMs > 0.0)
      val ctx = reactApplicationContext
      val settings = NativeTrackingSettings(ctx)
      settings.slowIntervalMs = slowIntervalMs.toLong()
      settings.enabled = true
      val intent = Intent(ctx, LocationService::class.java)
        .putExtra(LocationService.EXTRA_SLOW_INTERVAL, slowIntervalMs.toLong())
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
      NativeTrackingSettings(ctx).enabled = false
      LocationService.removeActivityUpdates(ctx)
      PlaceMonitor.unregister(ctx)
      ctx.stopService(Intent(ctx, LocationService::class.java))
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("stop_failed", e)
    }
  }

  @ReactMethod
  fun readFixBuffer(promise: Promise) {
    try {
      val out = com.facebook.react.bridge.Arguments.createArray()
      synchronized(LocationService.FIX_BUFFER_LOCK) {
        val file = java.io.File(reactApplicationContext.filesDir, LocationService.FIX_BUFFER_FILE)
        if (file.exists()) {
          file.readLines().forEach { line -> if (line.isNotBlank()) out.pushString(line) }
        }
      }
      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject("read_fix_buffer_failed", e)
    }
  }

  @ReactMethod
  fun ackFixBuffer(count: Double, promise: Promise) {
    try {
      require(count.isFinite() && count >= 0.0 && count % 1.0 == 0.0)
      synchronized(LocationService.FIX_BUFFER_LOCK) {
        val file = java.io.File(reactApplicationContext.filesDir, LocationService.FIX_BUFFER_FILE)
        if (file.exists()) {
          val remaining = file.readLines().drop(count.toInt())
          val atomic = AtomicFile(file)
          val stream = atomic.startWrite()
          try {
            stream.write(
              if (remaining.isEmpty()) byteArrayOf()
              else (remaining.joinToString("\n") + "\n").toByteArray(),
            )
            atomic.finishWrite(stream)
          } catch (error: Exception) {
            atomic.failWrite(stream)
            throw error
          }
        }
      }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ack_fix_buffer_failed", e)
    }
  }

  @ReactMethod
  fun syncPlaces(places: ReadableArray, promise: Promise) {
    try {
      val parsed = (0 until places.size()).map { index ->
        val place = requireNotNull(places.getMap(index)) { "Place $index is not an object" }
        val id = place.getDouble("id")
        require(id.isFinite() && id >= 0.0 && id % 1.0 == 0.0) {
          "Place $index has an invalid ID"
        }
        val parsedPlace = NativePlace(
          id = id.toLong(),
          kind = requireNotNull(place.getString("kind")),
          latitude = place.getDouble("latitude"),
          longitude = place.getDouble("longitude"),
          radiusM = place.getDouble("radius").toFloat(),
        )
        require(parsedPlace.kind in setOf("work", "home", "other"))
        require(parsedPlace.latitude in -90.0..90.0)
        require(parsedPlace.longitude in -180.0..180.0)
        require(parsedPlace.radiusM > 0f)
        parsedPlace
      }
      NativePlaceStore(reactApplicationContext).replace(parsed)
      val registration = if (NativeTrackingSettings(reactApplicationContext).enabled) {
        PlaceMonitor.sync(reactApplicationContext)
      } else {
        PlaceMonitor.unregister(reactApplicationContext)
      }
      registration
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { promise.reject("sync_places_failed", it) }
    } catch (e: Exception) {
      promise.reject("sync_places_failed", e)
    }
  }

  @ReactMethod
  fun readNativeEvents(promise: Promise) {
    try {
      val out = Arguments.createArray()
      NativeEventJournal(reactApplicationContext).readLines().forEach(out::pushString)
      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject("read_native_events_failed", e)
    }
  }

  @ReactMethod
  fun ackNativeEvents(sequence: Double, promise: Promise) {
    try {
      require(sequence.isFinite() && sequence >= 0.0 && sequence % 1.0 == 0.0) {
        "Sequence must be a non-negative integer"
      }
      NativeEventJournal(reactApplicationContext).ackThrough(sequence.toLong())
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ack_native_events_failed", e)
    }
  }

  @ReactMethod
  fun respondToDayEnd(token: String, confirmed: Boolean, promise: Promise) {
    try {
      WorkdayCoordinator.respond(reactApplicationContext, token, confirmed)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("respond_day_end_failed", e)
    }
  }
}
