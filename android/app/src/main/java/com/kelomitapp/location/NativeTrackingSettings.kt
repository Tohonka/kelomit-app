package com.kelomitapp.location

import android.content.Context

class NativeTrackingSettings(context: Context) {
  companion object {
    private const val PREFS = "native-location-settings"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_SLOW_INTERVAL_MS = "slow_interval_ms"
  }

  private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  var enabled: Boolean
    get() = prefs.getBoolean(KEY_ENABLED, false)
    set(value) {
      check(prefs.edit().putBoolean(KEY_ENABLED, value).commit()) {
        "Could not persist native tracking state"
      }
    }

  var slowIntervalMs: Long
    get() = prefs.getLong(KEY_SLOW_INTERVAL_MS, 60_000L)
    set(value) {
      require(value > 0L) { "Slow interval must be positive" }
      check(prefs.edit().putLong(KEY_SLOW_INTERVAL_MS, value).commit()) {
        "Could not persist native slow interval"
      }
    }
}
