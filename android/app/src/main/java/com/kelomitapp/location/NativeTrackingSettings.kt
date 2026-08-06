package com.kelomitapp.location

import android.content.Context

class NativeTrackingSettings(context: Context) {
  companion object {
    private const val PREFS = "native-location-settings"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_SLOW_INTERVAL_MS = "slow_interval_ms"
    private const val KEY_MODE = "mode"
    private const val KEY_POLICY_INTERVAL_MS = "policy_interval_ms"
    private const val KEY_MOVING_UNTIL_MS = "moving_until_ms"
    private const val KEY_STILL_FIXES = "still_fixes"
    private const val KEY_PAUSED_UNTIL_MS = "paused_until_ms"
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

  var movingUntilMs: Long
    get() = prefs.getLong(KEY_MOVING_UNTIL_MS, 0L)
    set(value) {
      check(prefs.edit().putLong(KEY_MOVING_UNTIL_MS, value).commit())
    }

  /** 0 = not paused, else resume epoch ms. [TrackingPause.INDEFINITE_PAUSE_MS] (2^62) is
   *  the agreed "paused until resumed" sentinel; Long.MAX_VALUE is merely tolerated
   *  (it's also >= that threshold, so every check against it still works). */
  var pausedUntilMs: Long
    get() = prefs.getLong(KEY_PAUSED_UNTIL_MS, 0L)
    set(value) {
      check(prefs.edit().putLong(KEY_PAUSED_UNTIL_MS, value).commit()) {
        "Could not persist tracking pause"
      }
    }

  fun isPaused(now: Long = System.currentTimeMillis()): Boolean =
    pausedUntilMs != 0L && now < pausedUntilMs

  fun policyState(slowIntervalMs: Long = this.slowIntervalMs): TrackingPolicy.State {
    val mode = runCatching {
      TrackingPolicy.Mode.valueOf(
        prefs.getString(KEY_MODE, TrackingPolicy.Mode.FAST.name)
          ?: TrackingPolicy.Mode.FAST.name,
      )
    }.getOrDefault(TrackingPolicy.Mode.FAST)
    val interval = when (mode) {
      TrackingPolicy.Mode.FAST -> prefs.getLong(KEY_POLICY_INTERVAL_MS, TrackingPolicy.FAST_MS)
      TrackingPolicy.Mode.SLOW -> slowIntervalMs
      TrackingPolicy.Mode.IDLE -> slowIntervalMs
    }
    return TrackingPolicy.State(
      mode = mode,
      intervalMs = interval,
      movingUntilMs = movingUntilMs,
      stillFixes = prefs.getInt(KEY_STILL_FIXES, 0),
    )
  }

  fun savePolicyState(state: TrackingPolicy.State) {
    check(
      prefs.edit()
        .putString(KEY_MODE, state.mode.name)
        .putLong(KEY_POLICY_INTERVAL_MS, state.intervalMs)
        .putLong(KEY_MOVING_UNTIL_MS, state.movingUntilMs)
        .putInt(KEY_STILL_FIXES, state.stillFixes)
        .commit(),
    ) {
      "Could not persist native tracking policy"
    }
  }
}
