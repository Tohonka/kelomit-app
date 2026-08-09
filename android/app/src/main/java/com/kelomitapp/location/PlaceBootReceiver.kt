package com.kelomitapp.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class PlaceBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    // Self-heal the timer notification: if a session was running when the
    // device rebooted, the notification is gone until some transition fires —
    // repost it here so it doesn't wait on the app being opened.
    com.kelomitapp.widget.TimerNotification.sync(context)
    TrackingPause.expireIfDue(context)
    if (NativeTrackingSettings(context).isPaused()) return
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
