package com.kelomitapp.reporting

import java.math.BigDecimal
import java.math.BigInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Test

class WorkReportSafetyTest {
  @Test
  fun parsesSecondsWithoutFloatingPointConversion() {
    assertEquals(Long.MAX_VALUE, parseNonNegativeSeconds(Long.MAX_VALUE))
    assertEquals(1L, parseNonNegativeSeconds(BigDecimal("1.0")))

    assertThrows(IllegalArgumentException::class.java) {
      parseNonNegativeSeconds(BigInteger.valueOf(Long.MAX_VALUE).add(BigInteger.ONE))
    }
    assertThrows(IllegalArgumentException::class.java) {
      parseNonNegativeSeconds(BigDecimal("1.5"))
    }
    assertThrows(IllegalArgumentException::class.java) {
      parseNonNegativeSeconds(1.0)
    }
    assertThrows(IllegalArgumentException::class.java) {
      parseNonNegativeSeconds(-1L)
    }
  }

  @Test
  fun cleanupKeepsThePrimaryFailureAndRunsEveryAction() {
    val primary = IllegalStateException("paint failed")
    val finishFailure = IllegalArgumentException("finish failed")
    var closed = false

    runCleanupsPreserving(
      primary,
      { throw finishFailure },
      { closed = true },
    )

    assertSame(finishFailure, primary.suppressed.single())
    assertEquals(true, closed)
  }

  @Test
  fun cleanupThrowsItsFirstFailureWhenThereIsNoPrimaryFailure() {
    val first = IllegalStateException("close failed")
    val second = IllegalArgumentException("delete failed")

    val thrown = assertThrows(IllegalStateException::class.java) {
      runCleanupsPreserving(
        null,
        { throw first },
        { throw second },
      )
    }

    assertSame(first, thrown)
    assertSame(second, thrown.suppressed.single())
  }
}
