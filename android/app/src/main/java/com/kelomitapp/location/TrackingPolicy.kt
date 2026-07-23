package com.kelomitapp.location

object TrackingPolicy {
  const val FAST_MS = 4_000L
  const val SPRINT_MS = 2_000L
  const val MOVING_LEASE_MS = 120_000L
  const val STILL_FIXES_TO_SLOW = 3
  const val STILL_FIXES_TO_IDLE = 2

  enum class Mode { FAST, SLOW, IDLE }

  data class State(
    val mode: Mode = Mode.FAST,
    val intervalMs: Long = FAST_MS,
    val movingUntilMs: Long = 0L,
    val stillFixes: Int = 0,
  )

  sealed interface Signal {
    data class Moving(val nowMs: Long) : Signal
    data class MovingFix(val speedMs: Float, val nowMs: Long) : Signal
    data class StillFix(val nowMs: Long) : Signal
  }

  fun reduce(state: State, signal: Signal): State = when (signal) {
    is Signal.Moving -> state.copy(
      mode = Mode.FAST,
      intervalMs = FAST_MS,
      movingUntilMs = signal.nowMs + MOVING_LEASE_MS,
      stillFixes = 0,
    )

    is Signal.MovingFix -> {
      val sprintThreshold = if (state.intervalMs == SPRINT_MS) 2.5f else 3.5f
      state.copy(
        mode = Mode.FAST,
        intervalMs = if (signal.speedMs >= sprintThreshold) SPRINT_MS else FAST_MS,
        movingUntilMs = signal.nowMs + MOVING_LEASE_MS,
        stillFixes = 0,
      )
    }

    is Signal.StillFix -> {
      if (signal.nowMs < state.movingUntilMs) {
        state.copy(stillFixes = 0)
      } else {
        val next = state.stillFixes + 1
        when {
          state.mode == Mode.FAST && next >= STILL_FIXES_TO_SLOW ->
            state.copy(mode = Mode.SLOW, stillFixes = 0)
          state.mode == Mode.SLOW && next >= STILL_FIXES_TO_IDLE ->
            state.copy(mode = Mode.IDLE, stillFixes = 0)
          else -> state.copy(stillFixes = next)
        }
      }
    }
  }
}
