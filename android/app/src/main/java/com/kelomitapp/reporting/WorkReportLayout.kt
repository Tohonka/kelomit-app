package com.kelomitapp.reporting

import kotlin.math.floor

object WorkReportLayout {
  const val PAGE_WIDTH = 595
  const val PAGE_HEIGHT = 842
  const val MARGIN = 42f
  const val FOOTER_TOP = 806f
  const val DATE_COLUMN_WIDTH = 88f
  const val WORK_TIME_COLUMN_WIDTH = 104f
  const val REGULAR_COLUMN_WIDTH = 58f
  const val REMOTE_COLUMN_WIDTH = 88f
  const val OVERTIME_COLUMN_WIDTH = 58f
  const val TOTAL_COLUMN_WIDTH = 68f

  fun needsPageBreak(currentY: Float, blockHeight: Float): Boolean =
    currentY + blockHeight > FOOTER_TOP

  fun ellipsize(
    text: String,
    maxWidth: Float,
    measure: (String) -> Float,
  ): String {
    require(maxWidth > 0f)
    if (measure(text) <= maxWidth) return text
    if (measure(ELLIPSIS) > maxWidth) return ""
    val prefixLength = prefixEnds(text).lastOrNull { end ->
      measure(text.substring(0, end).trimEnd() + ELLIPSIS) <= maxWidth
    } ?: return ELLIPSIS
    return text.substring(0, prefixLength).trimEnd() + ELLIPSIS
  }

  fun wrapLimited(
    text: String,
    maxWidth: Float,
    maxLines: Int,
    measure: (String) -> Float,
  ): List<String> {
    require(maxLines > 0)
    val lines = wrap(text, maxWidth, measure)
    if (lines.size <= maxLines) return lines
    return lines.take(maxLines - 1) +
      ellipsize(lines.drop(maxLines - 1).joinToString(" "), maxWidth, measure)
  }

  fun linesForPage(
    currentY: Float,
    remainingLines: Int,
    lineHeight: Float,
    trailingHeight: Float = 0f,
  ): Int {
    require(remainingLines >= 0 && lineHeight > 0f && trailingHeight >= 0f)
    if (remainingLines == 0) return 0
    val available = FOOTER_TOP - currentY
    if (remainingLines * lineHeight + trailingHeight <= available) {
      return remainingLines
    }
    val linesWithoutTrailing = floor(available / lineHeight).toInt().coerceAtLeast(0)
    return minOf(remainingLines - 1, linesWithoutTrailing)
  }

  fun wrap(
    text: String,
    maxWidth: Float,
    measure: (String) -> Float,
  ): List<String> {
    require(maxWidth > 0f)
    val words = text.trim().split(Regex("""\s+""")).filter(String::isNotEmpty)
    if (words.isEmpty()) return emptyList()

    val lines = mutableListOf<String>()
    var current = ""
    for (word in words) {
      if (measure(word) > maxWidth) {
        if (current.isNotEmpty()) {
          lines += current
          current = ""
        }
        var remaining = word
        while (remaining.isNotEmpty() && measure(remaining) > maxWidth) {
          val prefixLength = prefixEnds(remaining).lastOrNull {
            measure(remaining.substring(0, it)) <= maxWidth
          } ?: prefixEnds(remaining).first()
          lines += remaining.substring(0, prefixLength)
          remaining = remaining.substring(prefixLength)
        }
        current = remaining
        continue
      }

      val candidate = if (current.isEmpty()) word else "$current $word"
      if (measure(candidate) <= maxWidth) {
        current = candidate
      } else {
        lines += current
        current = word
      }
    }
    if (current.isNotEmpty()) lines += current
    return lines
  }

  private fun prefixEnds(text: String): List<Int> = buildList {
    var index = 0
    while (index < text.length) {
      index += Character.charCount(text.codePointAt(index))
      add(index)
    }
  }

  private const val ELLIPSIS = "…"
}
