package com.kelomitapp.reporting

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.Executors

class WorkReportModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val executor = Executors.newSingleThreadExecutor()

  override fun getName() = "WorkReport"

  @ReactMethod
  fun create(json: String, fileName: String, promise: Promise) {
    try {
      require(FILE_NAME.matches(fileName)) { "Invalid work report filename" }
      executor.execute {
        try {
          val file = WorkReportRenderer.render(reactApplicationContext, json, fileName)
          promise.resolve(file.absolutePath)
        } catch (error: Exception) {
          promise.reject("report_pdf_failed", error)
        }
      }
    } catch (error: Exception) {
      promise.reject("report_pdf_failed", error)
    }
  }

  override fun invalidate() {
    executor.shutdown()
    super.invalidate()
  }

  private companion object {
    val FILE_NAME = Regex(
      """work-report-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.pdf""",
    )
  }
}
