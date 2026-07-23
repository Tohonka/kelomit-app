package com.kelomitapp.reporting

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WorkReportLayoutTest {
  @Test
  fun usesA4PageDimensions() {
    assertEquals(595, WorkReportLayout.PAGE_WIDTH)
    assertEquals(842, WorkReportLayout.PAGE_HEIGHT)
  }

  @Test
  fun wrapsAtMeasuredWhitespace() {
    assertEquals(
      listOf("alpha", "beta", "gamma"),
      WorkReportLayout.wrap("alpha beta gamma", 5f) { it.length.toFloat() },
    )
  }

  @Test
  fun splitsWordsAtTheLongestFittingPrefix() {
    assertEquals(
      listOf("abc", "def"),
      WorkReportLayout.wrap("abcdef", 3f) { it.length.toFloat() },
    )
  }

  @Test
  fun ellipsizesAtTheMeasuredBoundary() {
    assertEquals(
      "ab…",
      WorkReportLayout.ellipsize("abcdef", 3f) { it.length.toFloat() },
    )
  }

  @Test
  fun limitsWrappedHeadingsWithoutClippingTheLastLine() {
    assertEquals(
      listOf("alpha", "beta…"),
      WorkReportLayout.wrapLimited("alpha beta gamma", 5f, 2) {
        it.length.toFloat()
      },
    )
  }

  @Test
  fun fragmentsOversizedLineBlocksAndReservesTrailingContent() {
    assertEquals(
      2,
      WorkReportLayout.linesForPage(
        currentY = 770f,
        remainingLines = 10,
        lineHeight = 14f,
        trailingHeight = 20f,
      ),
    )
    assertEquals(
      0,
      WorkReportLayout.linesForPage(
        currentY = 790f,
        remainingLines = 1,
        lineHeight = 14f,
        trailingHeight = 20f,
      ),
    )
  }

  @Test
  fun detectsTheFooterBoundary() {
    assertTrue(WorkReportLayout.needsPageBreak(currentY = 790f, blockHeight = 30f))
    assertFalse(WorkReportLayout.needsPageBreak(currentY = 700f, blockHeight = 30f))
  }
}
