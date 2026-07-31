package com.kelomitapp.reporting

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

class WorkReportModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "WorkReport"

  /**
   * Renders a report's HTML and hands it to Android's print UI.
   *
   * JS builds the document from the shared template (src/reports/); this side
   * only prints it. Resolves once the print job has been submitted — the user
   * chooses "Save as PDF" and the destination from there, so no path comes back.
   *
   * Runs on the main thread because WebView and PrintManager both require it.
   */
  @ReactMethod
  fun create(html: String, fileName: String, marginPt: Double, promise: Promise) {
    if (!isSafeReportFileName(fileName)) {
      promise.reject("report_pdf_failed", IllegalArgumentException("Invalid work report filename"))
      return
    }
    UiThreadUtil.runOnUiThread {
      val activity = reactApplicationContext.currentActivity
      if (activity == null) {
        promise.reject("report_pdf_failed", IllegalStateException("No activity to print from"))
        return@runOnUiThread
      }
      try {
        WorkReportPrinter.print(activity, html, fileName, marginPt.toInt()) { result ->
          result.fold(
            onSuccess = {promise.resolve(null)},
            onFailure = {promise.reject("report_pdf_failed", it)},
          )
        }
      } catch (error: Throwable) {
        promise.reject("report_pdf_failed", error)
      }
    }
  }
}
