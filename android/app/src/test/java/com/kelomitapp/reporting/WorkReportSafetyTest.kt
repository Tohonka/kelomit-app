package com.kelomitapp.reporting

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// The report filename is built from dates in JS and then names a print job, so
// this is the boundary worth guarding. The JSON-model parsing this file used to
// cover went away with the Canvas renderer — the printer takes finished HTML.
class WorkReportSafetyTest {
  @Test
  fun acceptsTheFilenameTheExportFlowBuilds() {
    assertTrue(isSafeReportFileName("work-report-2026-06-26-to-2026-07-25.pdf"))
  }

  @Test
  fun rejectsTraversalAndAnythingOffPattern() {
    listOf(
      "../work-report-2026-06-26-to-2026-07-25.pdf",
      "work-report-2026-06-26-to-2026-07-25.pdf/../evil.pdf",
      "/etc/passwd",
      "work-report-2026-06-26-to-2026-07-25.pdf.exe",
      "work-report-26-06-26-to-2026-07-25.pdf",
      "report.pdf",
      "",
    ).forEach {name ->
      assertFalse(name, isSafeReportFileName(name))
    }
  }
}
