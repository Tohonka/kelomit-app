package com.kelomitapp.location

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaceMembershipTest {
  private val work = NativePlace(1L, "work", 60.0, 24.0, 20f)

  @Test
  fun configuredRadiusControlsAcceptedEnter() {
    val outside = PlaceMembership.reduce(
      listOf(PlaceDistance(work, 21f)),
      emptySet(),
    )
    assertTrue(outside.crossings.isEmpty())

    val inside = PlaceMembership.reduce(
      listOf(PlaceDistance(work, 19f)),
      emptySet(),
    )
    assertEquals("enter", inside.crossings.single().direction)
  }

  @Test
  fun exitUsesHysteresis() {
    val held = PlaceMembership.reduce(
      listOf(PlaceDistance(work, 24f)),
      setOf(work.id),
    )
    assertTrue(held.crossings.isEmpty())
    assertEquals(setOf(work.id), held.insideIds)

    val exited = PlaceMembership.reduce(
      listOf(PlaceDistance(work, 26f)),
      held.insideIds,
    )
    assertEquals("exit", exited.crossings.single().direction)
    assertTrue(exited.insideIds.isEmpty())
  }

  @Test
  fun repeatedInsideFixDoesNotDuplicateEnter() {
    val result = PlaceMembership.reduce(
      listOf(PlaceDistance(work, 5f)),
      setOf(work.id),
    )

    assertTrue(result.crossings.isEmpty())
  }

  @Test
  fun reducesMultiplePlacesIndependently() {
    val home = NativePlace(2L, "home", 60.1, 24.1, 50f)
    val result = PlaceMembership.reduce(
      listOf(
        PlaceDistance(work, 10f),
        PlaceDistance(home, 100f),
      ),
      setOf(home.id),
    )

    assertEquals(listOf("enter", "exit"), result.crossings.map { it.direction })
    assertEquals(setOf(work.id), result.insideIds)
  }

  @Test
  fun persistedMembershipSurvivesReducerRecreation() {
    val entered = PlaceMembership.reduce(
      listOf(PlaceDistance(work, 10f)),
      emptySet(),
    )
    val afterRestart = PlaceMembership.reduce(
      listOf(PlaceDistance(work, 10f)),
      entered.insideIds,
    )

    assertTrue(afterRestart.crossings.isEmpty())
    assertEquals(setOf(work.id), afterRestart.insideIds)
  }
}
