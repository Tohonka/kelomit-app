package com.kelomitapp.reporting

import android.app.Activity
import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/** Filenames are built from dates in JS, but this is the only barrier between
 *  that string and the filesystem, so check it here too. */
internal fun isSafeReportFileName(name: String): Boolean =
  SAFE_FILE_NAME.matches(name) && !name.contains("..")

private val SAFE_FILE_NAME =
  Regex("""work-report-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.pdf""")

/**
 * Prints a report's HTML through Android's print framework.
 *
 * This replaced a hand-drawn Canvas renderer: the report is now one HTML
 * template (src/reports/) shared with the server, so the phone needs a layout
 * engine rather than its own column arithmetic. WebView is one.
 *
 * WHY THE SYSTEM PRINT UI: driving `PrintDocumentAdapter` directly is not open
 * to app code — `LayoutResultCallback` and `WriteResultCallback` both have
 * package-private constructors, so they cannot be subclassed outside
 * `android.print`. Handing the adapter to `PrintManager` is the supported path.
 * The user picks "Save as PDF" and a destination, which is why the export flow
 * no longer writes a file itself.
 *
 * Two things the caller must respect:
 *  - **Main thread only.** WebView and PrintManager both require it.
 *  - **The HTML must be self-contained.** It is loaded with a null base URL, so
 *    there is nowhere to fetch from — no external CSS, font or image resolves.
 *
 * The PDF has no page footer: WebView supports neither CSS margin boxes nor
 * running elements. The server's /report.pdf still numbers its pages.
 */
object WorkReportPrinter {
  /**
   * The WebView must outlive this call — the print framework keeps using its
   * adapter while the user is in the print UI, and a collected WebView yields a
   * truncated document. One export at a time, so retaining the last one is
   * enough; it is released when the next export starts.
   */
  private var printing: WebView? = null

  /**
   * Loads [html] and hands it to the print framework, calling [done] once the
   * print job has been submitted.
   *
   * [done] reports whether the document reached the print UI — not whether the
   * user then saved it. Android does not surface that without polling the job,
   * and nothing in the app acts on it.
   */
  fun print(
    activity: Activity,
    html: String,
    jobName: String,
    marginPt: Int,
    done: (Result<Unit>) -> Unit,
  ) {
    require(isSafeReportFileName(jobName)) {"Unsafe report filename"}

    // Must precede the first WebView in the process, or printing captures only
    // the visible viewport instead of the whole document.
    WebView.enableSlowWholeDocumentDraw()

    printing?.destroy()
    val webView = WebView(activity)
    printing = webView

    var settled = false
    fun settle(result: Result<Unit>) {
      if (settled) return
      settled = true
      if (result.isFailure) {
        // Nothing is using the adapter, so drop it now rather than leaking
        // until the next export.
        webView.destroy()
        if (printing === webView) printing = null
      }
      done(result)
    }

    webView.webViewClient = object : WebViewClient() {
      override fun onPageFinished(view: WebView, url: String?) {
        settle(runCatching {submit(activity, view, jobName, marginPt)})
      }

      override fun onReceivedError(
        view: WebView,
        request: WebResourceRequest,
        error: WebResourceError,
      ) {
        // Only the document itself can fail — it is self-contained, so there
        // are no subresource requests to ignore.
        if (request.isForMainFrame) {
          settle(Result.failure(IllegalStateException("Report HTML failed to load")))
        }
      }
    }

    webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
  }

  private fun submit(activity: Activity, view: WebView, jobName: String, marginPt: Int) {
    val service = activity.getSystemService(Context.PRINT_SERVICE) as? PrintManager
      ?: throw IllegalStateException("Printing is unavailable on this device")

    // Points to mils (1/1000 inch), the unit PrintAttributes speaks. These are
    // minimums the user can widen in the print UI.
    val margin = marginPt * 1000 / 72
    val attributes = PrintAttributes.Builder()
      .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
      .setMinMargins(PrintAttributes.Margins(margin, margin, margin, margin))
      .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
      .build()

    service.print(jobName, view.createPrintDocumentAdapter(jobName), attributes)
  }
}
