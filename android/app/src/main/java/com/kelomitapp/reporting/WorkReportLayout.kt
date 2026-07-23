package com.kelomitapp.reporting

object WorkReportLayout {
  const val PAGE_WIDTH = 595
  const val PAGE_HEIGHT = 842
  const val MARGIN = 42f
  const val FOOTER_TOP = 806f

  fun needsPageBreak(currentY: Float, blockHeight: Float): Boolean =
    currentY + blockHeight > FOOTER_TOP

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
          val prefixLength = (remaining.length downTo 1).firstOrNull {
            measure(remaining.substring(0, it)) <= maxWidth
          } ?: 1
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
}
