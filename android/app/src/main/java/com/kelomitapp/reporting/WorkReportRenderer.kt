package com.kelomitapp.reporting

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import java.io.File
import java.io.FileOutputStream
import java.math.BigDecimal
import java.math.BigInteger
import org.json.JSONArray
import org.json.JSONObject

internal fun parseNonNegativeSeconds(raw: Any): Long {
  val value = try {
    when (raw) {
      is Byte, is Short, is Int, is Long -> (raw as Number).toLong()
      is BigInteger -> raw.longValueExact()
      is BigDecimal -> raw.longValueExact()
      else -> throw IllegalArgumentException("seconds must be an exact integer")
    }
  } catch (error: ArithmeticException) {
    throw IllegalArgumentException("seconds must fit in a Long", error)
  }
  require(value >= 0L) { "seconds must be non-negative" }
  return value
}

internal fun runCleanupsPreserving(
  primary: Throwable?,
  vararg cleanups: () -> Unit,
) {
  var failure = primary
  cleanups.forEach { cleanup ->
    try {
      cleanup()
    } catch (error: Throwable) {
      val existing = failure
      if (existing == null) {
        failure = error
      } else if (existing !== error) {
        existing.addSuppressed(error)
      }
    }
  }
  if (primary == null && failure != null) throw failure
}

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
    var failure: Throwable? = null

    try {
      ReportPainter(document, model).render()
      stream = FileOutputStream(temporary)
      document.writeTo(stream)
      stream.fd.sync()
      stream.close()
      stream = null
      require(temporary.renameTo(output)) { "Could not publish report PDF" }
      return output
    } catch (error: Throwable) {
      failure = error
      throw error
    } finally {
      runCleanupsPreserving(
        failure,
        { stream?.close() },
        { document.close() },
        { if (temporary.exists()) temporary.delete() },
      )
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
      workTime = columnsJson.requiredText("workTime"),
      regular = columnsJson.requiredText("regular"),
      remoteOther = columnsJson.requiredText("remoteOther"),
      overtime = columnsJson.requiredText("overtime"),
      total = columnsJson.requiredText("total"),
    )
    val daysJson = root.getJSONArray("days")
    require(daysJson.length() > 0) { "Report must contain at least one day" }
    val days = daysJson.objects().map { day ->
      DayRow(
        date = day.requiredText("date"),
        workTime = day.text("workTime"),
        regular = day.requiredText("regular"),
        regularSeconds = day.nonNegativeSeconds("regularSeconds"),
        remoteOther = day.requiredText("remoteOther"),
        remoteOtherSeconds = day.nonNegativeSeconds("remoteOtherSeconds"),
        overtime = day.requiredText("overtime"),
        overtimeSeconds = day.nonNegativeSeconds("overtimeSeconds"),
        total = day.requiredText("total"),
        totalSeconds = day.nonNegativeSeconds("totalSeconds"),
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

  private fun JSONObject.nonNegativeSeconds(key: String = "seconds"): Long {
    val raw = get(key)
    return parseNonNegativeSeconds(raw)
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
    val workTime: String,
    val regular: String,
    val remoteOther: String,
    val overtime: String,
    val total: String,
  )

  private data class DayRow(
    val date: String,
    val workTime: String,
    val regular: String,
    val regularSeconds: Long,
    val remoteOther: String,
    val remoteOtherSeconds: Long,
    val overtime: String,
    val overtimeSeconds: Long,
    val total: String,
    val totalSeconds: Long,
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
    private var statisticsContentTop = 0f

    fun render() {
      try {
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
      } catch (error: Throwable) {
        val activePage = page
        page = null
        if (activePage != null) {
          runCleanupsPreserving(error, { document.finishPage(activePage) })
        }
        throw error
      }
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
      drawFittedText(
        current.canvas,
        "${model.meta.pageLabel} $pageNumber",
        WorkReportLayout.PAGE_WIDTH - WorkReportLayout.MARGIN,
        WorkReportLayout.PAGE_HEIGHT - 16f,
        9f,
        CONTENT_WIDTH,
        align = Paint.Align.RIGHT,
      )
      document.finishPage(current)
      page = null
    }

    private fun startFirstTimesheetPage() {
      val canvas = startPage()
      y = drawWrappedBlock(
        canvas,
        model.meta.title,
        MARGIN,
        42f,
        CONTENT_WIDTH,
        20f,
        25f,
        2,
        bold = true,
      )
      val ruleY = y + 8f
      drawRule(canvas, ruleY)

      y = ruleY + 25f
      y = drawWrappedBlock(
        canvas,
        model.meta.companyName,
        MARGIN,
        y,
        CONTENT_WIDTH,
        13f,
        18f,
        2,
        bold = true,
      ) + 4f
      y = drawWrappedBlock(
        canvas,
        model.meta.personName,
        MARGIN,
        y,
        CONTENT_WIDTH,
        11f,
        17f,
        2,
      ) + 4f
      y = drawWrappedBlock(
        canvas,
        model.meta.range,
        MARGIN,
        y,
        CONTENT_WIDTH,
        10f,
        15f,
        2,
      )

      val totalTop = y + 16f
      fill(canvas, MARGIN, totalTop, PAGE_RIGHT, totalTop + 58f, PALE_BLUE)
      drawFittedText(
        canvas,
        model.meta.totalLabel,
        MARGIN + 14f,
        totalTop + 21f,
        10f,
        TOTAL_LABEL_WIDTH,
      )
      drawFittedText(
        canvas,
        model.meta.totalHours,
        PAGE_RIGHT - 14f,
        totalTop + 42f,
        25f,
        TOTAL_HOURS_WIDTH,
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
      drawFittedText(
        canvas,
        identity,
        MARGIN,
        54f,
        11f,
        CONTENT_WIDTH,
        bold = true,
      )
      drawFittedText(canvas, model.meta.range, MARGIN, 71f, 9f, CONTENT_WIDTH)
    }

    private fun drawColumnHeadings(canvas: Canvas) {
      fill(canvas, MARGIN, y, TABLE_RIGHT, y + HEADER_HEIGHT, PALE_BLUE)
      drawTableText(canvas, model.columns.date, DATE_X, DATE_WIDTH, y, true)
      drawTableText(canvas, model.columns.workTime, WORK_TIME_X, WORK_TIME_WIDTH, y, true)
      drawTableText(canvas, model.columns.regular, REGULAR_X, REGULAR_WIDTH, y, true, true)
      drawTableText(canvas, model.columns.remoteOther, REMOTE_X, REMOTE_WIDTH, y, true, true)
      drawTableText(canvas, model.columns.overtime, OVERTIME_X, OVERTIME_WIDTH, y, true, true)
      drawTableText(canvas, model.columns.total, TOTAL_X, TOTAL_WIDTH, y, true, true)
      y += HEADER_HEIGHT
    }

    private fun drawDay(day: DayRow) {
      val dateLines = wrapLimited(day.date, DATE_WIDTH - CELL_GAP, 9f, 2)
      val workTimeLines = wrapLimited(day.workTime, WORK_TIME_WIDTH - CELL_GAP, 9f, 2)
      val headlineLines = day.headlines.map { headline ->
        wrap(headline, PAGE_RIGHT - HEADLINE_X, 9.5f)
      }
      val rowHeight = maxOf(
        DAY_ROW_HEIGHT,
        maxOf(dateLines.size, workTimeLines.size) * TABLE_LINE_HEIGHT + 8f,
      )
      val blockHeight = rowHeight + 4f +
        headlineLines.sumOf { it.size }.toFloat() * HEADLINE_LINE_HEIGHT +
        if (headlineLines.isEmpty()) 0f else 5f
      val continuationCapacity = WorkReportLayout.FOOTER_TOP - CONTINUATION_BODY_TOP
      if (
        WorkReportLayout.needsPageBreak(y, rowHeight) ||
        (
          blockHeight <= continuationCapacity &&
            WorkReportLayout.needsPageBreak(y, blockHeight)
          )
      ) {
        finishPage()
        startTimesheetContinuation()
      }

      val canvas = checkNotNull(page).canvas
      dateLines.forEachIndexed { index, line ->
        drawText(canvas, line, DATE_X, y + 14f + index * TABLE_LINE_HEIGHT, 9f)
      }
      workTimeLines.forEachIndexed { index, line ->
        drawText(canvas, line, WORK_TIME_X, y + 14f + index * TABLE_LINE_HEIGHT, 9f)
      }
      drawDuration(canvas, day.regular, REGULAR_X, REGULAR_WIDTH, y)
      drawDuration(canvas, day.remoteOther, REMOTE_X, REMOTE_WIDTH, y)
      drawDuration(canvas, day.overtime, OVERTIME_X, OVERTIME_WIDTH, y)
      drawDuration(canvas, day.total, TOTAL_X, TOTAL_WIDTH, y, true)
      y += rowHeight
      y += 4f

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
      drawHairline(checkNotNull(page).canvas, y - 1f)
    }

    private fun drawTableText(
      canvas: Canvas,
      text: String,
      x: Float,
      width: Float,
      top: Float,
      bold: Boolean,
      right: Boolean = false,
    ) {
      wrapLimited(text, width - CELL_GAP, 8f, 2, bold = bold)
        .forEachIndexed { index, line ->
          drawText(
            canvas,
            line,
            if (right) x + width - CELL_GAP else x,
            top + 13f + index * TABLE_LINE_HEIGHT,
            8f,
            bold = bold,
            align = if (right) Paint.Align.RIGHT else Paint.Align.LEFT,
          )
        }
    }

    private fun drawDuration(
      canvas: Canvas,
      text: String,
      x: Float,
      width: Float,
      top: Float,
      bold: Boolean = false,
    ) = drawFittedText(
      canvas,
      text,
      x + width - CELL_GAP,
      top + 18f,
      8.5f,
      width - CELL_GAP,
      bold = bold,
      align = Paint.Align.RIGHT,
    )

    private fun startStatisticsPage(statistics: Statistics) {
      val canvas = startPage()
      drawCompactIdentity(canvas)
      drawRule(canvas, 82f)
      y = drawWrappedBlock(
        canvas,
        statistics.title,
        MARGIN,
        96f,
        CONTENT_WIDTH,
        20f,
        24f,
        2,
        bold = true,
      ) + 14f
      statisticsContentTop = y
    }

    private fun drawStatisticsSection(
      statistics: Statistics,
      title: String,
      rows: List<AllocationRow>,
      note: String? = null,
    ) {
      val titleLines = wrapLimited(title, CONTENT_WIDTH, 13f, 2, bold = true)
      val noteLines = note?.let { wrap(it, CONTENT_WIDTH, 9f) }.orEmpty()
      val titleHeight = titleLines.size * SECTION_LINE_HEIGHT + SECTION_BOTTOM_GAP
      val firstRowHeight = rows.firstOrNull()?.let(::statisticsRowHeight) ?: 0f
      val introHeight = titleHeight + noteLines.size * NOTE_LINE_HEIGHT + firstRowHeight
      val freshCapacity = WorkReportLayout.FOOTER_TOP - statisticsContentTop
      val minimumContentHeight = when {
        noteLines.isNotEmpty() -> NOTE_LINE_HEIGHT
        firstRowHeight > 0f -> minOf(firstRowHeight, STAT_LINE_HEIGHT)
        else -> 0f
      }
      if (
        (
          introHeight <= freshCapacity &&
            WorkReportLayout.needsPageBreak(y, introHeight)
          ) ||
        WorkReportLayout.needsPageBreak(y, titleHeight + minimumContentHeight)
      ) {
        finishPage()
        startStatisticsPage(statistics)
      }
      drawStatisticsHeading(titleLines)

      drawStatisticsLines(
        statistics,
        titleLines,
        noteLines,
        NOTE_LINE_HEIGHT,
      ) { canvas, line, _ ->
        drawText(canvas, line, MARGIN, y + 10f, 9f, italic = true)
      }

      val maxSeconds = rows.maxOfOrNull(AllocationRow::seconds) ?: 0L
      rows.forEach { row ->
        val rowHeight = statisticsRowHeight(row)
        val freshRowCapacity =
          WorkReportLayout.FOOTER_TOP - statisticsContentTop - titleHeight
        if (
          rowHeight <= freshRowCapacity &&
            WorkReportLayout.needsPageBreak(y, rowHeight)
        ) {
          finishPage()
          startStatisticsPage(statistics)
          drawStatisticsHeading(titleLines)
        }
        drawStatisticsRow(statistics, titleLines, row, maxSeconds)
      }
    }

    private fun drawStatisticsHeading(titleLines: List<String>) {
      val canvas = checkNotNull(page).canvas
      titleLines.forEach { line ->
        drawText(canvas, line, MARGIN, y + 13f, 13f, bold = true)
        y += SECTION_LINE_HEIGHT
      }
      y += SECTION_BOTTOM_GAP
    }

    private fun statisticsRowHeight(row: AllocationRow): Float =
      wrap(row.label, STAT_LABEL_WIDTH, 9.5f).size * STAT_LINE_HEIGHT +
        STAT_TRAILING_HEIGHT

    private fun drawStatisticsRow(
      statistics: Statistics,
      titleLines: List<String>,
      row: AllocationRow,
      maxSeconds: Long,
    ) {
      val lines = wrap(row.label, STAT_LABEL_WIDTH, 9.5f)
      drawStatisticsLines(
        statistics,
        titleLines,
        lines,
        STAT_LINE_HEIGHT,
        STAT_TRAILING_HEIGHT,
      ) { canvas, line, index ->
        drawText(canvas, line, MARGIN, y + 10f, 9.5f)
        if (index == 0) {
          drawFittedText(
            canvas,
            row.hours,
            PAGE_RIGHT,
            y + 10f,
            9.5f,
            STAT_HOURS_WIDTH,
            bold = true,
            align = Paint.Align.RIGHT,
          )
        }
      }
      val canvas = checkNotNull(page).canvas
      fill(canvas, MARGIN, y + 3f, PAGE_RIGHT, y + 10f, PALE_BLUE)
      val fraction = if (maxSeconds == 0L) 0f else {
        (row.seconds.toDouble() / maxSeconds.toDouble()).toFloat().coerceIn(0f, 1f)
      }
      fill(canvas, MARGIN, y + 3f, MARGIN + CONTENT_WIDTH * fraction, y + 10f, BLUE)
      y += STAT_TRAILING_HEIGHT
    }

    private fun drawStatisticsLines(
      statistics: Statistics,
      titleLines: List<String>,
      lines: List<String>,
      lineHeight: Float,
      trailingHeight: Float = 0f,
      drawLine: (Canvas, String, Int) -> Unit,
    ) {
      var index = 0
      while (index < lines.size) {
        val count = WorkReportLayout.linesForPage(
          currentY = y,
          remainingLines = lines.size - index,
          lineHeight = lineHeight,
          trailingHeight = trailingHeight,
        )
        if (count == 0) {
          finishPage()
          startStatisticsPage(statistics)
          drawStatisticsHeading(titleLines)
          continue
        }
        repeat(count) {
          drawLine(checkNotNull(page).canvas, lines[index], index)
          y += lineHeight
          index += 1
        }
      }
    }

    private fun wrap(
      text: String,
      maxWidth: Float,
      size: Float,
      bold: Boolean = false,
      italic: Boolean = false,
    ): List<String> {
      configureText(size, bold, italic)
      return WorkReportLayout.wrap(text, maxWidth, paint::measureText)
    }

    private fun wrapLimited(
      text: String,
      maxWidth: Float,
      size: Float,
      maxLines: Int,
      bold: Boolean = false,
      italic: Boolean = false,
    ): List<String> {
      configureText(size, bold, italic)
      return WorkReportLayout.wrapLimited(
        text,
        maxWidth,
        maxLines,
        paint::measureText,
      )
    }

    private fun drawWrappedBlock(
      canvas: Canvas,
      text: String,
      x: Float,
      top: Float,
      maxWidth: Float,
      size: Float,
      lineHeight: Float,
      maxLines: Int,
      bold: Boolean = false,
      italic: Boolean = false,
      color: Int = NAVY,
    ): Float {
      val lines = wrapLimited(text, maxWidth, size, maxLines, bold, italic)
      lines.forEachIndexed { index, line ->
        drawText(
          canvas,
          line,
          x,
          top + size + index * lineHeight,
          size,
          bold,
          italic,
          color = color,
        )
      }
      return top + lines.size * lineHeight
    }

    private fun drawFittedText(
      canvas: Canvas,
      text: String,
      x: Float,
      baseline: Float,
      size: Float,
      maxWidth: Float,
      bold: Boolean = false,
      italic: Boolean = false,
      align: Paint.Align = Paint.Align.LEFT,
      color: Int = NAVY,
    ) {
      configureText(size, bold, italic, align, color)
      val fitted = WorkReportLayout.ellipsize(text, maxWidth, paint::measureText)
      drawText(canvas, fitted, x, baseline, size, bold, italic, align, color)
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
      const val DATE_X = MARGIN
      const val DATE_WIDTH = WorkReportLayout.DATE_COLUMN_WIDTH
      const val WORK_TIME_X = DATE_X + DATE_WIDTH
      const val WORK_TIME_WIDTH = WorkReportLayout.WORK_TIME_COLUMN_WIDTH
      const val REGULAR_X = WORK_TIME_X + WORK_TIME_WIDTH
      const val REGULAR_WIDTH = WorkReportLayout.REGULAR_COLUMN_WIDTH
      const val REMOTE_X = REGULAR_X + REGULAR_WIDTH
      const val REMOTE_WIDTH = WorkReportLayout.REMOTE_COLUMN_WIDTH
      const val OVERTIME_X = REMOTE_X + REMOTE_WIDTH
      const val OVERTIME_WIDTH = WorkReportLayout.OVERTIME_COLUMN_WIDTH
      const val TOTAL_X = OVERTIME_X + OVERTIME_WIDTH
      const val TOTAL_WIDTH = WorkReportLayout.TOTAL_COLUMN_WIDTH
      const val TABLE_RIGHT = TOTAL_X + TOTAL_WIDTH
      const val CELL_GAP = 5f
      const val HEADLINE_X = MARGIN + 22f
      const val STAT_LABEL_WIDTH = CONTENT_WIDTH - 78f
      const val STAT_HOURS_WIDTH = 70f
      const val TOTAL_LABEL_WIDTH = CONTENT_WIDTH - 180f
      const val TOTAL_HOURS_WIDTH = 160f
      const val DAY_ROW_HEIGHT = 28f
      const val HEADER_HEIGHT = 32f
      const val TABLE_LINE_HEIGHT = 11f
      const val HEADLINE_LINE_HEIGHT = 14f
      const val CONTINUATION_BODY_TOP = 121f
      const val SECTION_LINE_HEIGHT = 18f
      const val SECTION_BOTTOM_GAP = 7f
      const val NOTE_LINE_HEIGHT = 13f
      const val STAT_LINE_HEIGHT = 14f
      const val STAT_TRAILING_HEIGHT = 20f
    }
  }
}
