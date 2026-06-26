package com.kelomitapp.location

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * JS bridge to start/stop the background-location foreground service
 * ([LocationService]). Called from `App.tsx` on background/foreground
 * transitions when the user has enabled "Track in background".
 */
class BackgroundLocationModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "BackgroundLocation"

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
}
