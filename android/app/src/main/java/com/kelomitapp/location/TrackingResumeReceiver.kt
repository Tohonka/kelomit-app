package com.kelomitapp.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** AlarmManager target: a timed tracking pause has elapsed — resume. */
class TrackingResumeReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    TrackingPause.resume(context)
  }
}
