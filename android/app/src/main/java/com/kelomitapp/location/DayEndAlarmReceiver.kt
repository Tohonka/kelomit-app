package com.kelomitapp.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class DayEndAlarmReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_PROMPT = "com.kelomitapp.location.DAY_END_PROMPT"
    const val ACTION_ASSUME = "com.kelomitapp.location.DAY_END_ASSUME"
    const val EXTRA_TOKEN = "token"
  }

  override fun onReceive(context: Context, intent: Intent) {
    val token = intent.getStringExtra(EXTRA_TOKEN) ?: return
    when (intent.action) {
      ACTION_PROMPT -> WorkdayCoordinator.promptDue(context, token)
      ACTION_ASSUME -> WorkdayCoordinator.assumeDue(context, token)
    }
  }
}
