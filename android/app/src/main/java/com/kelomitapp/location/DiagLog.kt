package com.kelomitapp.location

import android.content.Context
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Native half of the on-device diagnostics. Appends to the SAME `diag.log` file
 * the JS side writes to (app filesDir == RNFS.DocumentDirectoryPath on Android),
 * so the export is one merged, chronological JS+native timeline. This side keeps
 * logging right up until Doze/the OS kills the process — the gap between the last
 * line here and the next `svc.onCreate` is how a silent kill is detected.
 *
 * Best-effort and self-trimming; never throws into the caller. Also mirrors to
 * logcat under the existing "KelomitLoc" tag for live debugging.
 */
object DiagLog {
  private const val FILE = "diag.log"
  private const val CAP_BYTES = 3L * 1024 * 1024
  private val stamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
    timeZone = TimeZone.getTimeZone("UTC")
  }

  @Synchronized
  fun write(ctx: Context, tag: String, msg: String) {
    Log.d("KelomitLoc", "$tag $msg")
    try {
      val f = File(ctx.filesDir, FILE)
      if (f.length() > CAP_BYTES) trim(f)
      f.appendText("${stamp.format(Date())} NAT $tag $msg\n")
    } catch (_: Exception) {
      // best-effort
    }
  }

  /** Head-trim to the last half so the file stays bounded across process runs. */
  private fun trim(f: File) {
    try {
      val text = f.readText()
      val half = text.substring(text.length / 2)
      val trimmed = half.substringAfter('\n', half)
      f.writeText("--- trimmed ${stamp.format(Date())} ---\n$trimmed")
    } catch (_: Exception) {
      // if trimming fails, let it keep growing rather than lose data
    }
  }
}
