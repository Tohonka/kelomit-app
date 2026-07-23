package com.kelomitapp.location

object WorkdayPolicy {
  const val PROMPT_DELAY_MS = 45 * 60_000L
  const val ASSUME_DELAY_MS = 8 * 60 * 60_000L

  data class Pending(
    val token: String,
    val exitAtMs: Long,
    val promptAtMs: Long,
    val promptedAtMs: Long? = null,
  )

  data class State(
    val insideWorkIds: Set<Long> = emptySet(),
    val pending: Pending? = null,
  )

  sealed interface Event {
    data class Enter(val locationId: Long, val atMs: Long) : Event
    data class Exit(val locationId: Long, val atMs: Long) : Event
    data class PromptDue(val token: String, val atMs: Long) : Event
    data class AssumeDue(val token: String, val atMs: Long) : Event
    data class Respond(
      val token: String,
      val confirmed: Boolean,
      val atMs: Long,
    ) : Event
  }

  sealed interface Effect {
    data class SchedulePrompt(val token: String, val atMs: Long) : Effect
    data class ScheduleAssumption(val token: String, val atMs: Long) : Effect
    data class CancelTimers(val token: String) : Effect
    data class ShowPrompt(val pending: Pending) : Effect
    data class CancelPrompt(val token: String) : Effect
    data class Journal(
      val type: String,
      val token: String,
      val exitAtMs: Long,
      val atMs: Long,
    ) : Effect
  }

  data class Result(
    val state: State,
    val effects: List<Effect> = emptyList(),
  )

  fun reduce(state: State, event: Event): Result = when (event) {
    is Event.Enter -> {
      val nextInside = state.insideWorkIds + event.locationId
      val pending = state.pending
      if (pending == null) {
        Result(state.copy(insideWorkIds = nextInside))
      } else {
        Result(
          state.copy(insideWorkIds = nextInside, pending = null),
          listOf(
            Effect.CancelTimers(pending.token),
            Effect.CancelPrompt(pending.token),
            Effect.Journal(
              "day_end_cancelled",
              pending.token,
              pending.exitAtMs,
              event.atMs,
            ),
          ),
        )
      }
    }

    is Event.Exit -> {
      val nextInside = state.insideWorkIds - event.locationId
      if (nextInside.isNotEmpty()) {
        Result(state.copy(insideWorkIds = nextInside))
      } else {
        val pending = Pending(
          token = "work-exit-${event.locationId}-${event.atMs}",
          exitAtMs = event.atMs,
          promptAtMs = event.atMs + PROMPT_DELAY_MS,
        )
        val effects = buildList {
          state.pending?.let {
            add(Effect.CancelTimers(it.token))
            add(Effect.CancelPrompt(it.token))
          }
          add(Effect.SchedulePrompt(pending.token, pending.promptAtMs))
        }
        Result(State(emptySet(), pending), effects)
      }
    }

    is Event.PromptDue -> {
      val pending = state.pending
      if (pending == null ||
        pending.token != event.token ||
        pending.promptedAtMs != null ||
        event.atMs < pending.promptAtMs
      ) {
        Result(state)
      } else {
        val prompted = pending.copy(promptedAtMs = event.atMs)
        Result(
          state.copy(pending = prompted),
          listOf(
            Effect.Journal(
              "day_end_prompted",
              prompted.token,
              prompted.exitAtMs,
              event.atMs,
            ),
            Effect.ShowPrompt(prompted),
            Effect.ScheduleAssumption(
              prompted.token,
              event.atMs + ASSUME_DELAY_MS,
            ),
          ),
        )
      }
    }

    is Event.AssumeDue -> {
      val pending = state.pending
      val promptedAt = pending?.promptedAtMs
      if (pending == null ||
        pending.token != event.token ||
        promptedAt == null ||
        event.atMs < promptedAt + ASSUME_DELAY_MS
      ) {
        Result(state)
      } else {
        Result(
          state.copy(pending = null),
          resolutionEffects(
            pending,
            "day_end_assumed",
            event.atMs,
          ),
        )
      }
    }

    is Event.Respond -> {
      val pending = state.pending
      if (pending == null || pending.token != event.token) {
        Result(state)
      } else {
        Result(
          state.copy(pending = null),
          resolutionEffects(
            pending,
            if (event.confirmed) "day_end_confirmed" else "day_end_rejected",
            event.atMs,
          ),
        )
      }
    }
  }

  private fun resolutionEffects(
    pending: Pending,
    type: String,
    atMs: Long,
  ): List<Effect> = listOf(
    Effect.Journal(type, pending.token, pending.exitAtMs, atMs),
    Effect.CancelTimers(pending.token),
    Effect.CancelPrompt(pending.token),
  )
}
