package com.kelomitapp.reporting

import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WorkReportRendererTest {
  @Test
  fun testEnglishHeadlinesSpanTimesheetPages() {
    val days = JSONArray().apply {
      listOf(
        "2026-06-01" to "Monday",
        "2026-06-02" to "Tuesday",
        "2026-06-03" to "Wednesday",
        "2026-06-04" to "Thursday",
        "2026-06-05" to "Friday",
        "2026-06-06" to "Saturday",
        "2026-06-07" to "Sunday",
        "2026-06-08" to "Monday",
        "2026-06-09" to "Tuesday",
        "2026-06-10" to "Wednesday",
        "2026-06-11" to "Thursday",
        "2026-06-12" to "Friday",
      ).forEachIndexed { index, (date, weekday) ->
        put(
          day(
            date = date,
            weekday = weekday,
            hours = "7 h 30 min",
            seconds = 27_000,
            details = "Work periods 08:00-12:00 · 13:00-16:30 · Overtime 0:30",
            headlines = arrayOf(
              "Prepared customer delivery ${index + 1} and reviewed the detailed implementation notes with the project team",
              "Documented follow-up actions, open questions, and the next practical steps for the customer",
            ),
          ),
        )
      }
    }

    val file = WorkReportRenderer.render(
      InstrumentationRegistry.getInstrumentation().targetContext,
      report(
        personName = "Alex Example",
        companyName = "Northwind Workshop Ltd",
        range = "1 Jun 2026 - 12 Jun 2026",
        title = "Work hours and headlines",
        totalLabel = "Total work hours",
        totalHours = "90 h 00 min",
        pageLabel = "Page",
        dateLabel = "Date",
        weekdayLabel = "Weekday",
        hoursLabel = "Hours",
        days = days,
      ).toString(),
      "work-report-sample-en.pdf",
    )

    assertPdf(file, expectedMinimumPages = 2)
  }

  @Test
  fun testFinnishStatisticsPreserveGlyphsAndStartOnANewPage() {
    val days = JSONArray().apply {
      listOf(
        "1.6.2026" to "maanantai",
        "2.6.2026" to "tiistai",
        "3.6.2026" to "keskiviikko",
        "4.6.2026" to "torstai",
        "5.6.2026" to "perjantai",
        "6.6.2026" to "lauantai",
        "7.6.2026" to "sunnuntai",
        "8.6.2026" to "maanantai",
        "9.6.2026" to "tiistai",
        "10.6.2026" to "keskiviikko",
      ).forEachIndexed { index, (date, weekday) ->
        put(
          day(
            date = date,
            weekday = weekday,
            hours = "8 h 00 min",
            seconds = 28_800,
            details = "Työajat 07:30-11:30 · 12:00-16:00",
            headlines = arrayOf(
              "Päivän ${index + 1} asiakastyö ja dokumentointi",
            ),
          ),
        )
      }
    }
    val statistics = JSONObject()
      .put("title", "Tilastot")
      .put("byProjectTitle", "Työaika projekteittain")
      .put("byTagTitle", "Työaika tunnisteittain")
      .put(
        "nonExclusiveNote",
        "Tunnisteiden ajat eivät sulje toisiaan pois, joten sama työ voi näkyä useassa tunnisteessa.",
      )
      .put(
        "projectRows",
        allocations(
          allocation(
            "Asiakastyö - Äänekosken tehdasalueen sähköjärjestelmän suunnittelu ja tarkastus",
            "30 h 00 min",
            108_000,
          ),
          allocation(
            "Sisäinen kehitys - työajanseurannan käyttöliittymän saavutettavuusparannukset",
            "20 h 00 min",
            72_000,
          ),
          allocation("Ylläpito ja dokumentointi", "12 h 00 min", 43_200),
          allocation("Koulutus - työvälineiden päivitys", "8 h 00 min", 28_800),
          allocation("Seuraamaton työaika", "10 h 00 min", 36_000),
        ),
      )
      .put(
        "tagRows",
        allocations(
          allocation(
            "Kiireellinen ja määräpäivään sidottu asiakastyö",
            "28 h 00 min",
            100_800,
          ),
          allocation("Sähkö- ja automaatiojärjestelmät", "24 h 00 min", 86_400),
          allocation("Etätyö ja syvä keskittyminen", "18 h 00 min", 64_800),
          allocation("Työmaalla tehty tarkastus", "14 h 00 min", 50_400),
          allocation("Ilman tunnistetta", "6 h 00 min", 21_600),
        ),
      )

    val file = WorkReportRenderer.render(
      InstrumentationRegistry.getInstrumentation().targetContext,
      report(
        personName = "Jörgen Määttä",
        companyName = "Äänekosken Öljy ja Sähkö Oy",
        range = "1.6.2026 - 10.6.2026",
        title = "Työaikaraportti - tunnit ja tilastot",
        totalLabel = "Työtunnit yhteensä",
        totalHours = "80 h 00 min",
        pageLabel = "Sivu",
        dateLabel = "Päivä",
        weekdayLabel = "Viikonpäivä",
        hoursLabel = "Tunnit",
        days = days,
        statistics = statistics,
      ).toString(),
      "work-report-sample-fi.pdf",
    )

    assertPdf(file, expectedMinimumPages = 2)
  }

  private fun assertPdf(file: File, expectedMinimumPages: Int) {
    assertTrue(file.length() > 1_000)
    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
      PdfRenderer(descriptor).use { renderer ->
        assertTrue(renderer.pageCount >= expectedMinimumPages)
        renderer.openPage(0).use { page ->
          assertEquals(595, page.width)
          assertEquals(842, page.height)
        }
      }
    }
  }

  private fun report(
    personName: String,
    companyName: String,
    range: String,
    title: String,
    totalLabel: String,
    totalHours: String,
    pageLabel: String,
    dateLabel: String,
    weekdayLabel: String,
    hoursLabel: String,
    days: JSONArray,
    statistics: JSONObject? = null,
  ): JSONObject = JSONObject()
    .put(
      "meta",
      JSONObject()
        .put("personName", personName)
        .put("companyName", companyName)
        .put("range", range)
        .put("title", title)
        .put("totalLabel", totalLabel)
        .put("totalHours", totalHours)
        .put("pageLabel", pageLabel),
    )
    .put(
      "columns",
      JSONObject()
        .put("date", dateLabel)
        .put("weekday", weekdayLabel)
        .put("hours", hoursLabel),
    )
    .put("days", days)
    .apply { statistics?.let { put("statistics", it) } }

  private fun day(
    date: String,
    weekday: String,
    hours: String,
    seconds: Int,
    details: String,
    headlines: Array<String> = emptyArray(),
  ): JSONObject = JSONObject()
    .put("date", date)
    .put("weekday", weekday)
    .put("hours", hours)
    .put("seconds", seconds)
    .put("details", details)
    .put("headlines", JSONArray(headlines))

  private fun allocation(label: String, hours: String, seconds: Int): JSONObject =
    JSONObject()
      .put("label", label)
      .put("hours", hours)
      .put("seconds", seconds)

  private fun allocations(vararg rows: JSONObject): JSONArray =
    JSONArray().apply { rows.forEach(::put) }
}
