package com.kelomitapp.location

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.text.format.DateFormat
import androidx.core.app.NotificationCompat
import com.kelomitapp.MainActivity
import com.kelomitapp.R
import org.json.JSONArray
import org.json.JSONObject
import java.util.Date
import kotlin.math.max

object WorkdayCoordinator {
  private const val PREFS = "native-workday"
  private const val KEY_STATE = "state"
  private const val CHANNEL_ID = "day-end"
  private const val PROMPT_ALARM_REQUEST = 4713
  private const val ASSUME_ALARM_REQUEST = 4714
  private const val NOTIFICATION_BASE = 4800

  private val handler = Handler(Looper.getMainLooper())
  private var promptRunnable: Runnable? = null
  private var assumeRunnable: Runnable? = null

  @Synchronized
  fun onCrossing(
    context: Context,
    locationId: Long,
    direction: String,
    timestamp: Long,
  ) {
    val event = when (direction) {
      "enter" -> WorkdayPolicy.Event.Enter(locationId, timestamp)
      "exit" -> WorkdayPolicy.Event.Exit(locationId, timestamp)
      else -> return
    }
    dispatch(context, event)
  }

  @Synchronized
  fun promptDue(context: Context, token: String, nowMs: Long = System.currentTimeMillis()) {
    dispatch(context, WorkdayPolicy.Event.PromptDue(token, nowMs))
  }

  @Synchronized
  fun assumeDue(context: Context, token: String, nowMs: Long = System.currentTimeMillis()) {
    dispatch(context, WorkdayPolicy.Event.AssumeDue(token, nowMs))
  }

  @Synchronized
  fun respond(
    context: Context,
    token: String,
    confirmed: Boolean,
    nowMs: Long = System.currentTimeMillis(),
  ): Boolean = dispatch(
    context,
    WorkdayPolicy.Event.Respond(token, confirmed, nowMs),
  )

  @Synchronized
  fun restoreDeadlines(context: Context) {
    val pending = load(context).pending
    if (pending == null) {
      cancelTimers(context, "")
      return
    }
    if (pending.promptedAtMs == null) {
      schedulePrompt(context, pending.token, max(pending.promptAtMs, System.currentTimeMillis()))
    } else {
      showPrompt(context, pending)
      scheduleAssumption(
        context,
        pending.token,
        max(
          pending.promptedAtMs + WorkdayPolicy.ASSUME_DELAY_MS,
          System.currentTimeMillis(),
        ),
      )
    }
    DiagLog.write(context, "work.restore", "token=${pending.token}")
  }

  private fun dispatch(context: Context, event: WorkdayPolicy.Event): Boolean {
    val before = load(context)
    val result = WorkdayPolicy.reduce(before, event)
    if (result.state == before && result.effects.isEmpty()) return false

    result.effects.filterIsInstance<WorkdayPolicy.Effect.Journal>().forEach { effect ->
      NativeEventJournal(context).append(
        effect.type,
        mapOf(
          "token" to effect.token,
          "exitTimestamp" to effect.exitAtMs,
          "timestamp" to effect.atMs,
        ),
      )
    }
    save(context, result.state)
    result.effects.filterNot { it is WorkdayPolicy.Effect.Journal }.forEach { effect ->
      execute(context, effect)
    }
    DiagLog.write(
      context,
      "work.transition",
      "event=${event.javaClass.simpleName} pending=${result.state.pending?.token}",
    )
    return true
  }

  private fun execute(context: Context, effect: WorkdayPolicy.Effect) {
    when (effect) {
      is WorkdayPolicy.Effect.SchedulePrompt ->
        schedulePrompt(context, effect.token, effect.atMs)
      is WorkdayPolicy.Effect.ScheduleAssumption ->
        scheduleAssumption(context, effect.token, effect.atMs)
      is WorkdayPolicy.Effect.CancelTimers ->
        cancelTimers(context, effect.token)
      is WorkdayPolicy.Effect.ShowPrompt ->
        showPrompt(context, effect.pending)
      is WorkdayPolicy.Effect.CancelPrompt ->
        cancelPrompt(context, effect.token)
      is WorkdayPolicy.Effect.Journal -> Unit
    }
  }

  private fun schedulePrompt(context: Context, token: String, atMs: Long) {
    alarmManager(context).setAndAllowWhileIdle(
      AlarmManager.RTC_WAKEUP,
      atMs,
      alarmIntent(context, DayEndAlarmReceiver.ACTION_PROMPT, token, PROMPT_ALARM_REQUEST),
    )
    promptRunnable?.let(handler::removeCallbacks)
    promptRunnable = Runnable { promptDue(context.applicationContext, token) }.also {
      handler.postDelayed(it, max(0L, atMs - System.currentTimeMillis()))
    }
    DiagLog.write(context, "work.schedule.prompt", "token=$token at=$atMs")
  }

  private fun scheduleAssumption(context: Context, token: String, atMs: Long) {
    alarmManager(context).setAndAllowWhileIdle(
      AlarmManager.RTC_WAKEUP,
      atMs,
      alarmIntent(context, DayEndAlarmReceiver.ACTION_ASSUME, token, ASSUME_ALARM_REQUEST),
    )
    assumeRunnable?.let(handler::removeCallbacks)
    assumeRunnable = Runnable { assumeDue(context.applicationContext, token) }.also {
      handler.postDelayed(it, max(0L, atMs - System.currentTimeMillis()))
    }
    DiagLog.write(context, "work.schedule.assume", "token=$token at=$atMs")
  }

  private fun cancelTimers(context: Context, token: String) {
    alarmManager(context).cancel(
      alarmIntent(context, DayEndAlarmReceiver.ACTION_PROMPT, token, PROMPT_ALARM_REQUEST),
    )
    alarmManager(context).cancel(
      alarmIntent(context, DayEndAlarmReceiver.ACTION_ASSUME, token, ASSUME_ALARM_REQUEST),
    )
    promptRunnable?.let(handler::removeCallbacks)
    assumeRunnable?.let(handler::removeCallbacks)
    promptRunnable = null
    assumeRunnable = null
  }

  private fun alarmIntent(
    context: Context,
    action: String,
    token: String,
    requestCode: Int,
  ): PendingIntent = PendingIntent.getBroadcast(
    context,
    requestCode,
    Intent(context, DayEndAlarmReceiver::class.java)
      .setAction(action)
      .putExtra(DayEndAlarmReceiver.EXTRA_TOKEN, token),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
  )

  private fun showPrompt(context: Context, pending: WorkdayPolicy.Pending) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(
          CHANNEL_ID,
          context.getString(R.string.day_end_channel_name),
          NotificationManager.IMPORTANCE_DEFAULT,
        ),
      )
    }
    val time = DateFormat.getTimeFormat(context).format(Date(pending.exitAtMs))
    val contentIntent = PendingIntent.getActivity(
      context,
      pending.token.hashCode(),
      Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val yes = actionIntent(context, pending.token, true)
    val no = actionIntent(context, pending.token, false)
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_tracking)
      .setContentTitle(context.getString(R.string.day_end_title))
      .setContentText(context.getString(R.string.day_end_question, time))
      .setContentIntent(contentIntent)
      .setAutoCancel(false)
      .addAction(0, context.getString(R.string.day_end_yes), yes)
      .addAction(0, context.getString(R.string.day_end_no), no)
      .build()
    try {
      manager.notify(notificationId(pending.token), notification)
      DiagLog.write(context, "work.prompt", "token=${pending.token}")
    } catch (error: SecurityException) {
      DiagLog.write(context, "work.prompt.fail", error.javaClass.simpleName)
    }
  }

  private fun actionIntent(
    context: Context,
    token: String,
    confirmed: Boolean,
  ): PendingIntent {
    val action = if (confirmed) {
      DayEndActionReceiver.ACTION_YES
    } else {
      DayEndActionReceiver.ACTION_NO
    }
    return PendingIntent.getBroadcast(
      context,
      token.hashCode() xor if (confirmed) 1 else 2,
      Intent(context, DayEndActionReceiver::class.java)
        .setAction(action)
        .putExtra(DayEndActionReceiver.EXTRA_TOKEN, token),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun cancelPrompt(context: Context, token: String) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.cancel(notificationId(token))
  }

  private fun notificationId(token: String): Int = NOTIFICATION_BASE xor token.hashCode()

  private fun alarmManager(context: Context): AlarmManager =
    context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  private fun load(context: Context): WorkdayPolicy.State {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getString(KEY_STATE, null)
      ?: return WorkdayPolicy.State()
    return runCatching {
      val json = JSONObject(raw)
      val inside = json.optJSONArray("insideWorkIds") ?: JSONArray()
      val ids = buildSet {
        for (index in 0 until inside.length()) add(inside.getLong(index))
      }
      val pendingJson = json.optJSONObject("pending")
      val pending = pendingJson?.let {
        WorkdayPolicy.Pending(
          token = it.getString("token"),
          exitAtMs = it.getLong("exitAtMs"),
          promptAtMs = it.getLong("promptAtMs"),
          promptedAtMs = if (it.isNull("promptedAtMs")) null else it.getLong("promptedAtMs"),
        )
      }
      WorkdayPolicy.State(ids, pending)
    }.getOrElse {
      DiagLog.write(context, "work.state.fail", "read")
      WorkdayPolicy.State()
    }
  }

  private fun save(context: Context, state: WorkdayPolicy.State) {
    val json = JSONObject().apply {
      put("insideWorkIds", JSONArray(state.insideWorkIds.sorted()))
      put(
        "pending",
        state.pending?.let { pending ->
          JSONObject().apply {
            put("token", pending.token)
            put("exitAtMs", pending.exitAtMs)
            put("promptAtMs", pending.promptAtMs)
            put("promptedAtMs", pending.promptedAtMs ?: JSONObject.NULL)
          }
        } ?: JSONObject.NULL,
      )
    }
    check(
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_STATE, json.toString())
        .commit(),
    ) { "Could not persist workday state" }
  }
}
