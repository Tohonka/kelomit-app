import notifee, {
  AndroidImportance,
  AndroidNotificationSetting,
  AndroidVisibility,
  EventType,
  TriggerType,
  type Event,
  type TimestampTrigger,
} from '@notifee/react-native';
import i18n from '../i18n';
import {getNags, getNagDoneMap, setNagDone} from '../db/nags';
import {createEntry} from '../db/entries';
import {getOrCreateDay} from '../db/days';
import {fireTimes, nextOccurrence, occurrences} from '../utils/nagSchedule';
import {formatTime, localDateOf} from '../utils/timeFormat';
import {diag} from './diag';
import type {Nag} from '../types';

export const NAG_CHANNEL_ID = 'nags';
const ID_PREFIX = 'nag-';
/** Total scheduled triggers across all nags; the sync re-fills on every run. */
const MAX_TRIGGERS = 60;
const HORIZON_DAYS = 7;
const SNOOZE_MS = 30 * 60_000;
export const ACTION_DONE = 'nag-done';
export const ACTION_SNOOZE = 'nag-snooze';

/** `nag-<nagId>-<dueMs>-<n>`; the first two parts identify the occurrence. */
function triggerId(nagId: number, dueAt: string, n: string | number): string {
  return `${ID_PREFIX}${nagId}-${Date.parse(dueAt)}-${n}`;
}
function occurrencePrefix(nagId: number, dueAt: string): string {
  return `${ID_PREFIX}${nagId}-${Date.parse(dueAt)}-`;
}

export async function ensureNagChannel(): Promise<void> {
  await notifee.createChannel({
    id: NAG_CHANNEL_ID,
    name: i18n.t('nags.channelName'),
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
  });
}

/** True when Android lets us fire exact alarms (Settings → Alarms & reminders). */
export async function exactAlarmsAllowed(): Promise<boolean> {
  const s = await notifee.getNotificationSettings();
  return s.android.alarm === AndroidNotificationSetting.ENABLED;
}

async function createNagTrigger(nag: Nag, dueAt: string, atMs: number, id: string): Promise<void> {
  const due = Date.parse(dueAt);
  const overdue = atMs >= due;
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: atMs,
    alarmManager: {allowWhileIdle: true},
  };
  await notifee.createTriggerNotification(
    {
      id,
      title: nag.title,
      body: i18n.t(overdue ? 'nags.wasDueAt' : 'nags.dueBy', {time: formatTime(dueAt)}),
      data: {nagId: String(nag.id), dueAt},
      android: {
        channelId: NAG_CHANNEL_ID,
        smallIcon: 'ic_launcher',
        pressAction: {id: 'default', launchActivity: 'default'},
        visibility: AndroidVisibility.PUBLIC,
        // A live count-down to the due time ("Task needs to be done by HH:MM").
        ...(nag.countdown && !overdue
          ? {showChronometer: true, chronometerDirection: 'down' as const, timestamp: due}
          : {}),
        actions: [
          {title: i18n.t('common.done'), pressAction: {id: ACTION_DONE}},
          {title: i18n.t('nags.snooze'), pressAction: {id: ACTION_SNOOZE}},
        ],
      },
    },
    trigger,
  );
}

/**
 * Re-plan every nag notification from the DB: drop all `nag-` triggers, then
 * schedule the next fires (up to MAX_TRIGGERS) over the coming week for
 * every active, undone occurrence. Idempotent — call after any nag write,
 * at launch and on resume.
 */
export async function syncNagTriggers(nowMs = Date.now()): Promise<number> {
  const existing = (await notifee.getTriggerNotificationIds()).filter(id => id.startsWith(ID_PREFIX));
  if (existing.length) { await notifee.cancelTriggerNotifications(existing); }
  const nags = await getNags();
  if (nags.length === 0) { return 0; }
  await ensureNagChannel();
  const done = await getNagDoneMap(nags.map(n => n.id));
  const fires: {nag: Nag; dueAt: string; at: number; n: number}[] = [];
  for (const nag of nags) {
    for (const dueAt of occurrences(nag.schedule, nowMs, HORIZON_DAYS)) {
      if (done.has(`${nag.id}|${dueAt}`)) { continue; }
      fireTimes(nag, dueAt, nowMs).forEach((at, n) => fires.push({nag, dueAt, at, n}));
    }
  }
  fires.sort((a, b) => a.at - b.at);
  const batch = fires.slice(0, MAX_TRIGGERS);
  for (const f of batch) {
    await createNagTrigger(f.nag, f.dueAt, f.at, triggerId(f.nag.id, f.dueAt, f.n));
  }
  return batch.length;
}

/** Mark one occurrence done (or undone) and log a small-task note on that day. */
export async function markNagDone(nag: Nag, dueAt: string, done = true): Promise<void> {
  const doneAt = done ? new Date().toISOString() : null;
  await setNagDone(nag.id, dueAt, doneAt);
  if (doneAt) {
    // ponytail: no back-link column; undoing "done" leaves the note in place.
    const day = await getOrCreateDay(localDateOf(doneAt));
    await createEntry({
      day_id: day.id,
      entry_type: 'note',
      activity_type: nag.activity_type,
      title: nag.title,
      body: nag.note,
      is_small_task: true,
      duration_sec: 0,
      time_from: doneAt,
      time_to: doneAt,
    });
    const displayed = await notifee.getDisplayedNotifications();
    const prefix = occurrencePrefix(nag.id, dueAt);
    for (const d of displayed) {
      if (d.id?.startsWith(prefix)) { await notifee.cancelDisplayedNotification(d.id); }
    }
  }
  await syncNagTriggers();
}

/** Next undone occurrence across all nags, for the Home strip and the widget. */
export async function nextNag(nowMs = Date.now()): Promise<{nag: Nag; dueAt: string} | null> {
  const nags = await getNags();
  const done = await getNagDoneMap(nags.map(n => n.id));
  let best: {nag: Nag; dueAt: string} | null = null;
  for (const nag of nags) {
    const due = nextOccurrence(nag, done, nowMs);
    if (due && (!best || Date.parse(due) < Date.parse(best.dueAt))) { best = {nag, dueAt: due}; }
  }
  return best;
}

/**
 * Notification events (foreground and headless background). Returns true
 * when the event was a nag press so the caller can navigate to the Nags tab.
 */
export async function handleNagEvent({type, detail}: Event): Promise<boolean> {
  const data = detail.notification?.data as {nagId?: string; dueAt?: string} | undefined;
  const id = detail.notification?.id;
  if (!data?.nagId || !data.dueAt || !id?.startsWith(ID_PREFIX)) { return false; }
  const nagId = Number(data.nagId);
  const dueAt = data.dueAt;
  const prefix = occurrencePrefix(nagId, dueAt);
  try {
    if (type === EventType.DELIVERED) {
      // Only the newest notification of an occurrence stays up.
      const displayed = await notifee.getDisplayedNotifications();
      for (const d of displayed) {
        if (d.id && d.id !== id && d.id.startsWith(prefix)) { await notifee.cancelDisplayedNotification(d.id); }
      }
      return false;
    }
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === ACTION_DONE) {
      const nag = (await getNags()).find(n => n.id === nagId);
      await notifee.cancelDisplayedNotification(id);
      if (nag) { await markNagDone(nag, dueAt); }
      return false;
    }
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === ACTION_SNOOZE) {
      await notifee.cancelDisplayedNotification(id);
      const nag = (await getNags()).find(n => n.id === nagId);
      if (nag) { await createNagTrigger(nag, dueAt, Date.now() + SNOOZE_MS, triggerId(nagId, dueAt, `s${Date.now()}`)); }
      return false;
    }
    return type === EventType.PRESS;
  } catch (e) {
    diag('nag.event.fail', String(e));
    return false;
  }
}
