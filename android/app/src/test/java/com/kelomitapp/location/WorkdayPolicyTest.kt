package com.kelomitapp.location

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WorkdayPolicyTest {
  @Test
  fun finalWorkExitCreatesFortyFiveMinuteCandidate() {
    val result = WorkdayPolicy.reduce(
      WorkdayPolicy.State(insideWorkIds = setOf(1L)),
      WorkdayPolicy.Event.Exit(1L, atMs = 1_000L),
    )

    assertEquals(1_000L, result.state.pending?.exitAtMs)
    assertEquals(2_701_000L, result.state.pending?.promptAtMs)
    assertEquals(
      2_701_000L,
      result.effects.filterIsInstance<WorkdayPolicy.Effect.SchedulePrompt>()
        .single()
        .atMs,
    )
  }

  @Test
  fun exitWhileAnotherWorkLocationRemainsDoesNothing() {
    val result = WorkdayPolicy.reduce(
      WorkdayPolicy.State(insideWorkIds = setOf(1L, 2L)),
      WorkdayPolicy.Event.Exit(1L, atMs = 1_000L),
    )

    assertEquals(setOf(2L), result.state.insideWorkIds)
    assertNull(result.state.pending)
    assertTrue(result.effects.isEmpty())
  }

  @Test
  fun reentryBeforePromptCancelsCandidate() {
    val exited = finalExit()
    val result = WorkdayPolicy.reduce(
      exited.state,
      WorkdayPolicy.Event.Enter(2L, atMs = 2_000L),
    )

    assertNull(result.state.pending)
    assertEquals(setOf(2L), result.state.insideWorkIds)
    assertEquals(
      "day_end_cancelled",
      result.effects.filterIsInstance<WorkdayPolicy.Effect.Journal>().single().type,
    )
  }

  @Test
  fun reentryAfterPromptCancelsNotificationAndMakesActionsStale() {
    val exited = finalExit()
    val token = exited.state.pending!!.token
    val prompted = WorkdayPolicy.reduce(
      exited.state,
      WorkdayPolicy.Event.PromptDue(token, exited.state.pending.promptAtMs),
    )
    val reentered = WorkdayPolicy.reduce(
      prompted.state,
      WorkdayPolicy.Event.Enter(2L, atMs = prompted.state.pending!!.promptedAtMs!! + 1L),
    )
    val staleAction = WorkdayPolicy.reduce(
      reentered.state,
      WorkdayPolicy.Event.Respond(token, confirmed = true, atMs = 9_000L),
    )

    assertNull(reentered.state.pending)
    assertTrue(reentered.effects.any { it is WorkdayPolicy.Effect.CancelPrompt })
    assertEquals(reentered.state, staleAction.state)
    assertTrue(staleAction.effects.isEmpty())
  }

  @Test
  fun promptNeverFiresBeforeDeadlineAndAssumptionUsesPromptTime() {
    val exited = finalExit()
    val pending = exited.state.pending!!
    val early = WorkdayPolicy.reduce(
      exited.state,
      WorkdayPolicy.Event.PromptDue(pending.token, pending.promptAtMs - 1L),
    )
    assertEquals(exited.state, early.state)
    assertTrue(early.effects.isEmpty())

    val onTime = WorkdayPolicy.reduce(
      exited.state,
      WorkdayPolicy.Event.PromptDue(pending.token, pending.promptAtMs),
    )
    val assumption = onTime.effects
      .filterIsInstance<WorkdayPolicy.Effect.ScheduleAssumption>()
      .single()
    assertEquals(
      pending.promptAtMs + WorkdayPolicy.ASSUME_DELAY_MS,
      assumption.atMs,
    )
    assertTrue(onTime.effects.any { it is WorkdayPolicy.Effect.ShowPrompt })
  }

  @Test
  fun yesNoAndUnansweredProduceDistinctJournalResults() {
    val exited = finalExit()
    val token = exited.state.pending!!.token
    val yes = WorkdayPolicy.reduce(
      exited.state,
      WorkdayPolicy.Event.Respond(token, confirmed = true, atMs = 3_000L),
    )
    assertEquals(
      "day_end_confirmed",
      yes.effects.filterIsInstance<WorkdayPolicy.Effect.Journal>().single().type,
    )

    val no = WorkdayPolicy.reduce(
      exited.state,
      WorkdayPolicy.Event.Respond(token, confirmed = false, atMs = 3_000L),
    )
    assertEquals(
      "day_end_rejected",
      no.effects.filterIsInstance<WorkdayPolicy.Effect.Journal>().single().type,
    )

    val prompted = WorkdayPolicy.reduce(
      exited.state,
      WorkdayPolicy.Event.PromptDue(token, exited.state.pending.promptAtMs),
    )
    val promptedAt = prompted.state.pending!!.promptedAtMs!!
    val assumed = WorkdayPolicy.reduce(
      prompted.state,
      WorkdayPolicy.Event.AssumeDue(
        token,
        promptedAt + WorkdayPolicy.ASSUME_DELAY_MS,
      ),
    )
    assertEquals(
      "day_end_assumed",
      assumed.effects.filterIsInstance<WorkdayPolicy.Effect.Journal>().single().type,
    )
    assertNull(assumed.state.pending)
  }

  @Test
  fun staleTokenIsANoOp() {
    val exited = finalExit()
    val result = WorkdayPolicy.reduce(
      exited.state,
      WorkdayPolicy.Event.Respond("old-token", confirmed = true, atMs = 3_000L),
    )

    assertEquals(exited.state, result.state)
    assertTrue(result.effects.isEmpty())
  }

  @Test
  fun laterFinalExitUsesLatestExitAfterCancellation() {
    val first = finalExit()
    val reentered = WorkdayPolicy.reduce(
      first.state,
      WorkdayPolicy.Event.Enter(1L, atMs = 2_000L),
    )
    val second = WorkdayPolicy.reduce(
      reentered.state,
      WorkdayPolicy.Event.Exit(1L, atMs = 5_000L),
    )

    assertEquals(5_000L, second.state.pending?.exitAtMs)
    assertTrue(second.state.pending?.token != first.state.pending?.token)
  }

  private fun finalExit(): WorkdayPolicy.Result = WorkdayPolicy.reduce(
    WorkdayPolicy.State(insideWorkIds = setOf(1L)),
    WorkdayPolicy.Event.Exit(1L, atMs = 1_000L),
  )
}
