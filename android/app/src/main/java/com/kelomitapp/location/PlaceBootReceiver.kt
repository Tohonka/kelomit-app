package com.kelomitapp.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class PlaceBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!NativeTrackingSettings(context).enabled) return
    val pending = goAsync()
    PlaceMonitor.sync(context).addOnCompleteListener { task ->
      if (!task.isSuccessful) {
        DiagLog.write(
          context,
          "crossing.register.fail",
          task.exception?.javaClass?.simpleName ?: "unknown",
        )
      }
      pending.finish()
    }
  }
}
