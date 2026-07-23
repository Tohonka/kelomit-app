package com.kelomitapp.reporting

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import java.io.File
import java.io.FileOutputStream
import org.json.JSONArray
import org.json.JSONObject

object WorkReportRenderer {
  private val safeFileName = Regex("""[A-Za-z0-9][A-Za-z0-9._-]*\.pdf""")

  fun render(context: Context, json: String, fileName: String): File {
    require(safeFileName.matches(fileName) && !fileName.contains("..")) {
      "Unsafe report filename"
    }
    val model = parse(JSONObject(json))
    val output = File(context.cacheDir, fileName)
    val temporary = File.createTempFile(".$fileName-", ".tmp", context.cacheDir)
    val document = PdfDocument()
    var stream: FileOutputStream? = null

    try {
      ReportPainter(document, model).render()
      stream = FileOutputStream(temporary)
      document.writeTo(stream)
      stream.fd.sync()
      stream.close()
      stream = null
      require(temporary.renameTo(output)) { "Could not publish report PDF" }
      return output
    } finally {
      try {
        stream?.close()
      } finally {
        try {
          document.close()
        } finally {
          if (temporary.exists()) temporary.delete()
        }
      }
    }
  }

  private fun parse(root: JSONObject): ReportModel {
    val metaJson = root.getJSONObject("meta")
    val meta = Meta(
      personName = metaJson.requiredText("personName"),
      companyName = metaJson.requiredText("companyName"),
      range = metaJson.requiredText("range"),
      title = metaJson.requiredText("title"),
      totalLabel = metaJson.requiredText("totalLabel"),
      totalHours = metaJson.requiredText("totalHours"),
      pageLabel = metaJson.requiredText("pageLabel"),
    )
    val columnsJson = root.getJSONObject("columns")
    val columns = Columns(
      date = columnsJson.requiredText("date"),
      weekday = columnsJson.requiredText("weekday"),
      hours = columnsJson.requiredText("hours"),
    )
    val daysJson = root.getJSONArray("days")
    require(daysJson.length() > 0) { "Report must contain at least one day" }
    val days = daysJson.objects().map { day ->
      DayRow(
        date = day.requiredText("date"),
        weekday = day.requiredText("weekday"),
        hours = day.requiredText("hours"),
        seconds = day.nonNegativeSeconds(),
        headlines = day.getJSONArray("headlines").strings(),
      )
    }
    val statistics = if (!root.has("statistics") || root.isNull("statistics")) {
      null
    } else {
      val statisticsJson = root.getJSONObject("statistics")
      Statistics(
        title = statisticsJson.requiredText("title"),
        byProjectTitle = statisticsJson.requiredText("byProjectTitle"),
        byTagTitle = statisticsJson.requiredText("byTagTitle"),
        nonExclusiveNote = statisticsJson.requiredText("nonExclusiveNote"),
        projectRows = statisticsJson.getJSONArray("projectRows").allocationRows(),
        tagRows = statisticsJson.getJSONArray("tagRows").allocationRows(),
      )
    }
    return ReportModel(meta, columns, days, statistics)
  }

  private fun JSONObject.text(key: String): String {
    val value = get(key)
    require(value is String) { "$key must be text" }
    return value.trim()
  }

  private fun JSONObject.requiredText(key: String): String =
    text(key).also { require(it.isNotEmpty()) { "$key must not be blank" } }

  private fun JSONObject.nonNegativeSeconds(): Long {
    val raw = get("seconds")
    require(raw is Number) { "seconds must be numeric" }
    val value = raw.toDouble()
    require(
      value.isFinite() &&
        value >= 0.0 &&
        value % 1.0 == 0.0 &&
        value <= Long.MAX_VALUE.toDouble(),
    ) { "seconds must be a non-negative integer" }
    return value.toLong()
  }

  private fun JSONArray.objects(): List<JSONObject> =
    (0 until length()).map(::getJSONObject)

  private fun JSONArray.strings(): List<String> =
    (0 until length()).map { index ->
      val value = get(index)
      require(value is String && value.isNotBlank()) {
        "Array item $index must be non-blank text"
      }
      value.trim()
    }

  private fun JSONArray.allocationRows(): List<AllocationRow> =
    objects().map { row ->
      AllocationRow(
        label = row.requiredText("label"),
        hours = row.requiredText("hours"),
        seconds = row.nonNegativeSeconds(),
      )
    }

  private data class ReportModel(
    val meta: Meta,
    val columns: Columns,
    val days: List<DayRow>,
    val statistics: Statistics?,
  )

  private data class Meta(
    val personName: String,
    val companyName: String,
    val range: String,
    val title: String,
    val totalLabel: String,
    val totalHours: String,
    val pageLabel: String,
  )

  private data class Columns(
    val date: String,
    val weekday: String,
    val hours: String,
  )

  private data class DayRow(
    val date: String,
    val weekday: String,
    val hours: String,
    val seconds: Long,
    val headlines: List<String>,
  )

  private data class Statistics(
    val title: String,
    val byProjectTitle: String,
    val byTagTitle: String,
    val nonExclusiveNote: String,
    val projectRows: List<AllocationRow>,
    val tagRows: List<AllocationRow>,
  )

  private data class AllocationRow(
    val label: String,
    val hours: String,
    val seconds: Long,
  )

  private class ReportPainter(
    private val document: PdfDocument,
    private val model: ReportModel,
  ) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var page: PdfDocument.Page? = null
    private var pageNumber = 0
    private var y = 0f

    fun render() {
      startFirstTimesheetPage()
      model.days.forEach(::drawDay)
      model.statistics?.let { statistics ->
        finishPage()
        startStatisticsPage(statistics)
        drawStatisticsSection(
          statistics,
          statistics.byProjectTitle,
          statistics.projectRows,
        )
        y += 18f
        drawStatisticsSection(
          statistics,
          statistics.byTagTitle,
          statistics.tagRows,
          statistics.nonExclusiveNote,
        )
      }
      finishPage()
    }

    private fun startPage(): Canvas {
      check(page == null)
      pageNumber += 1
      val info = PdfDocument.PageInfo.Builder(
        WorkReportLayout.PAGE_WIDTH,
        WorkReportLayout.PAGE_HEIGHT,
        pageNumber,
      ).create()
      return document.startPage(info).also { page = it }.canvas
    }

    private fun finishPage() {
      val current = checkNotNull(page)
      drawText(
        current.canvas,
        "${model.meta.pageLabel} $pageNumber",
        WorkReportLayout.PAGE_WIDTH - WorkReportLayout.MARGIN,
        WorkReportLayout.PAGE_HEIGHT - 16f,
        9f,
        align = Paint.Align.RIGHT,
      )
      document.finishPage(current)
      page = null
    }

    private fun startFirstTimesheetPage() {
      val canvas = startPage()
      drawText(canvas, model.meta.title, MARGIN, 68f, 22f, bold = true)
      drawRule(canvas, 86f)

      y = 112f
      drawText(canvas, model.meta.companyName, MARGIN, y, 13f, bold = true)
      y += 17f
      drawText(canvas, model.meta.personName, MARGIN, y, 11f)
      y += 17f
      drawText(canvas, model.meta.range, MARGIN, y, 10f)

      val totalTop = y + 18f
      fill(canvas, MARGIN, totalTop, PAGE_RIGHT, totalTop + 58f, PALE_BLUE)
      drawText(canvas, model.meta.totalLabel, MARGIN + 14f, totalTop + 21f, 10f)
      drawText(
        canvas,
        model.meta.totalHours,
        PAGE_RIGHT - 14f,
        totalTop + 42f,
        25f,
        bold = true,
        align = Paint.Align.RIGHT,
        color = BLUE,
      )
      y = totalTop + 76f
      drawColumnHeadings(canvas)
    }

    private fun startTimesheetContinuation() {
      val canvas = startPage()
      drawCompactIdentity(canvas)
      drawRule(canvas, 82f)
      y = 94f
      drawColumnHeadings(canvas)
    }

    private fun drawCompactIdentity(canvas: Canvas) {
      val identity = "${model.meta.companyName} · ${model.meta.personName}"
      drawText(canvas, identity, MARGIN, 54f, 11f, bold = true)
      drawText(canvas, model.meta.range, MARGIN, 71f, 9f)
    }

    private fun drawColumnHeadings(canvas: Canvas) {
      fill(canvas, MARGIN, y, PAGE_RIGHT, y + 27f, PALE_BLUE)
      val baseline = y + 18f
      drawText(canvas, model.columns.date, DATE_X, baseline, 9f, bold = true)
      drawText(canvas, model.columns.weekday, WEEKDAY_X, baseline, 9f, bold = true)
      drawText(
        canvas,
        model.columns.hours,
        PAGE_RIGHT - 10f,
        baseline,
        9f,
        bold = true,
        align = Paint.Align.RIGHT,
      )
      y += 27f
    }

    private fun drawDay(day: DayRow) {
      val headlineLines = day.headlines.map { headline ->
        wrap(headline, PAGE_RIGHT - HEADLINE_X, 9.5f)
      }
      val blockHeight = DAY_ROW_HEIGHT +
        headlineLines.sumOf { it.size }.toFloat() * HEADLINE_LINE_HEIGHT +
        if (headlineLines.isEmpty()) 0f else 5f
      if (WorkReportLayout.needsPageBreak(y, blockHeight)) {
        finishPage()
        startTimesheetContinuation()
      }

      val canvas = checkNotNull(page).canvas
      val baseline = y + 18f
      drawText(canvas, day.date, DATE_X, baseline, 10f)
      drawText(canvas, day.weekday, WEEKDAY_X, baseline, 10f)
      drawText(
        canvas,
        day.hours,
        PAGE_RIGHT - 10f,
        baseline,
        10f,
        bold = true,
        align = Paint.Align.RIGHT,
      )
      drawHairline(canvas, y + DAY_ROW_HEIGHT - 1f)
      y += DAY_ROW_HEIGHT

      headlineLines.forEach { lines ->
        lines.forEachIndexed { index, line ->
          if (WorkReportLayout.needsPageBreak(y, HEADLINE_LINE_HEIGHT)) {
            finishPage()
            startTimesheetContinuation()
          }
          val lineCanvas = checkNotNull(page).canvas
          if (index == 0) {
            fill(lineCanvas, MARGIN + 8f, y + 5f, MARGIN + 12f, y + 9f, BLUE)
          }
          drawText(lineCanvas, line, HEADLINE_X, y + 11f, 9.5f)
          y += HEADLINE_LINE_HEIGHT
        }
      }
      if (headlineLines.isNotEmpty()) y += 5f
    }

    private fun startStatisticsPage(statistics: Statistics) {
      val canvas = startPage()
      drawCompactIdentity(canvas)
      drawRule(canvas, 82f)
      drawText(canvas, statistics.title, MARGIN, 116f, 20f, bold = true)
      y = 138f
    }

    private fun drawStatisticsSection(
      statistics: Statistics,
      title: String,
      rows: List<AllocationRow>,
      note: String? = null,
    ) {
      val noteLines = note?.let { wrap(it, CONTENT_WIDTH, 9f) }.orEmpty()
      val headingHeight = 25f + noteLines.size * 13f
      val firstRowHeight = rows.firstOrNull()?.let(::statisticsRowHeight) ?: 0f
      if (WorkReportLayout.needsPageBreak(y, headingHeight + firstRowHeight)) {
        finishPage()
        startStatisticsPage(statistics)
      }
      drawStatisticsHeading(title, noteLines)

      val maxSeconds = rows.maxOfOrNull(AllocationRow::seconds) ?: 0L
      rows.forEach { row ->
        val rowHeight = statisticsRowHeight(row)
        if (WorkReportLayout.needsPageBreak(y, rowHeight)) {
          finishPage()
          startStatisticsPage(statistics)
          drawStatisticsHeading(title, noteLines)
        }
        drawStatisticsRow(row, maxSeconds)
      }
    }

    private fun drawStatisticsHeading(title: String, noteLines: List<String>) {
      val canvas = checkNotNull(page).canvas
      drawText(canvas, title, MARGIN, y + 14f, 13f, bold = true)
      y += 25f
      noteLines.forEach { line ->
        drawText(canvas, line, MARGIN, y + 10f, 9f, italic = true)
        y += 13f
      }
    }

    private fun statisticsRowHeight(row: AllocationRow): Float =
      wrap(row.label, STAT_LABEL_WIDTH, 9.5f).size * 14f + 20f

    private fun drawStatisticsRow(row: AllocationRow, maxSeconds: Long) {
      val canvas = checkNotNull(page).canvas
      val lines = wrap(row.label, STAT_LABEL_WIDTH, 9.5f)
      lines.forEachIndexed { index, line ->
        drawText(canvas, line, MARGIN, y + 10f, 9.5f)
        if (index == 0) {
          drawText(
            canvas,
            row.hours,
            PAGE_RIGHT,
            y + 10f,
            9.5f,
            bold = true,
            align = Paint.Align.RIGHT,
          )
        }
        y += 14f
      }
      fill(canvas, MARGIN, y + 3f, PAGE_RIGHT, y + 10f, PALE_BLUE)
      val fraction = if (maxSeconds == 0L) 0f else {
        (row.seconds.toDouble() / maxSeconds.toDouble()).toFloat().coerceIn(0f, 1f)
      }
      fill(canvas, MARGIN, y + 3f, MARGIN + CONTENT_WIDTH * fraction, y + 10f, BLUE)
      y += 20f
    }

    private fun wrap(text: String, maxWidth: Float, size: Float): List<String> {
      configureText(size)
      return WorkReportLayout.wrap(text, maxWidth, paint::measureText)
    }

    private fun drawText(
      canvas: Canvas,
      text: String,
      x: Float,
      baseline: Float,
      size: Float,
      bold: Boolean = false,
      italic: Boolean = false,
      align: Paint.Align = Paint.Align.LEFT,
      color: Int = NAVY,
    ) {
      configureText(size, bold, italic, align, color)
      canvas.drawText(text, x, baseline, paint)
    }

    private fun configureText(
      size: Float,
      bold: Boolean = false,
      italic: Boolean = false,
      align: Paint.Align = Paint.Align.LEFT,
      color: Int = NAVY,
    ) {
      paint.reset()
      paint.isAntiAlias = true
      paint.style = Paint.Style.FILL
      paint.color = color
      paint.textSize = size
      paint.textAlign = align
      paint.typeface = Typeface.create(
        Typeface.DEFAULT,
        when {
          bold && italic -> Typeface.BOLD_ITALIC
          bold -> Typeface.BOLD
          italic -> Typeface.ITALIC
          else -> Typeface.NORMAL
        },
      )
    }

    private fun fill(
      canvas: Canvas,
      left: Float,
      top: Float,
      right: Float,
      bottom: Float,
      color: Int,
    ) {
      paint.reset()
      paint.style = Paint.Style.FILL
      paint.color = color
      canvas.drawRect(left, top, right, bottom, paint)
    }

    private fun drawRule(canvas: Canvas, y: Float) {
      fill(canvas, MARGIN, y, PAGE_RIGHT, y + 3f, BLUE)
    }

    private fun drawHairline(canvas: Canvas, y: Float) {
      fill(canvas, MARGIN, y, PAGE_RIGHT, y + 0.75f, DIVIDER)
    }

    private companion object {
      val NAVY = Color.rgb(25, 48, 71)
      val BLUE = Color.rgb(43, 108, 176)
      val PALE_BLUE = Color.rgb(232, 242, 251)
      val DIVIDER = Color.rgb(214, 224, 234)
      const val MARGIN = WorkReportLayout.MARGIN
      const val PAGE_RIGHT = WorkReportLayout.PAGE_WIDTH - MARGIN
      const val CONTENT_WIDTH = WorkReportLayout.PAGE_WIDTH - MARGIN * 2
      const val DATE_X = MARGIN + 10f
      const val WEEKDAY_X = 210f
      const val HEADLINE_X = MARGIN + 22f
      const val STAT_LABEL_WIDTH = CONTENT_WIDTH - 78f
      const val DAY_ROW_HEIGHT = 28f
      const val HEADLINE_LINE_HEIGHT = 14f
    }
  }
}
