package com.kelomitapp.location

import android.content.Context
import android.util.AtomicFile
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

class NativeEventJournal(context: Context) {
  companion object {
    private const val FILE = "native-location-events.jsonl"
    private const val PREFS = "native-location-events"
    private const val KEY_SEQUENCE = "sequence"
    private val LOCK = Any()
  }

  private val context = context.applicationContext
  private val file = File(this.context.filesDir, FILE)
  private val atomicFile = AtomicFile(file)
  private val prefs = this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun append(type: String, fields: Map<String, Any?>): Long {
    val sequence = synchronized(LOCK) {
      val lines = readLinesLocked()
      val lastInFile = lines.maxOfOrNull {
        runCatching { JSONObject(it).optLong("sequence", 0L) }.getOrDefault(0L)
      } ?: 0L
      val next = maxOf(prefs.getLong(KEY_SEQUENCE, 0L), lastInFile) + 1L
      val event = JSONObject().apply {
        fields.forEach { (key, value) -> put(key, value ?: JSONObject.NULL) }
        put("sequence", next)
        put("type", type)
      }
      writeLinesLocked(lines + event.toString())
      check(prefs.edit().putLong(KEY_SEQUENCE, next).commit()) {
        "Could not persist native event sequence"
      }
      next
    }
    notifyLiveJs(sequence)
    return sequence
  }

  fun readLines(): List<String> = synchronized(LOCK) {
    readLinesLocked()
  }

  fun ackThrough(sequence: Long) {
    synchronized(LOCK) {
      val remaining = readLinesLocked().filter { line ->
        runCatching { JSONObject(line).getLong("sequence") }
          .getOrNull()
          ?.let { it > sequence }
          ?: true
      }
      writeLinesLocked(remaining)
    }
  }

  private fun readLinesLocked(): List<String> {
    if (!file.exists()) return emptyList()
    return atomicFile.openRead().bufferedReader().use { reader ->
      reader.readLines().filter(String::isNotBlank)
    }
  }

  private fun writeLinesLocked(lines: List<String>) {
    var stream: FileOutputStream? = null
    try {
      stream = atomicFile.startWrite()
      val content = if (lines.isEmpty()) "" else lines.joinToString("\n", postfix = "\n")
      stream.write(content.toByteArray(Charsets.UTF_8))
      atomicFile.finishWrite(stream)
    } catch (error: Exception) {
      if (stream != null) atomicFile.failWrite(stream)
      throw error
    }
  }

  private fun notifyLiveJs(sequence: Long) {
    val reactContext = (context as? ReactApplication)?.reactHost?.currentReactContext ?: return
    val event = Arguments.createMap().apply {
      putDouble("sequence", sequence.toDouble())
    }
    reactContext.emitDeviceEvent("onNativeEventAvailable", event)
  }
}
