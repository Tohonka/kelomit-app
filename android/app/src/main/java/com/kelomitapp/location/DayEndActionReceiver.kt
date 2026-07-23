package com.kelomitapp.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class DayEndActionReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_YES = "com.kelomitapp.location.DAY_END_YES"
    const val ACTION_NO = "com.kelomitapp.location.DAY_END_NO"
    const val EXTRA_TOKEN = "token"
  }

  override fun onReceive(context: Context, intent: Intent) {
    val token = intent.getStringExtra(EXTRA_TOKEN) ?: return
    val confirmed = when (intent.action) {
      ACTION_YES -> true
      ACTION_NO -> false
      else -> return
    }
    WorkdayCoordinator.respond(context, token, confirmed)
  }
}
