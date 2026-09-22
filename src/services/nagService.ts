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
import {getSetting} from '../db/settings';
import {resolveLanguageSetting} from '../i18n';
import {nativeClearPendingNagDones, nativeGetPendingNagDones, nativeSetNagWidgetState} from '../native/widgetSession';
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

/** Headless JS starts with the device language; the app's setting wins. */
async function applyLanguage(): Promise<void> {
  const lang = resolveLanguageSetting(await getSetting('language').catch(() => null));
  if (i18n.language !== lang) { await i18n.changeLanguage(lang); }
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
  await applyLanguage();
  const nags = await getNags();
  const done = await getNagDoneMap(nags.map(n => n.id));
  const fires: {nag: Nag; dueAt: string; at: number; n: number}[] = [];
  const live = new Set<string>();
  for (const nag of nags) {
    for (const dueAt of occurrences(nag.schedule, nowMs, HORIZON_DAYS)) {
      if (done.has(`${nag.id}|${dueAt}`)) { continue; }
      live.add(occurrencePrefix(nag.id, dueAt));
      fireTimes(nag, dueAt, nowMs).forEach((at, n) => fires.push({nag, dueAt, at, n}));
    }
  }
  // Drop every planned trigger; keep a snooze (`…-s<ms>`) only while its
  // occurrence is still live — done/deleted nags must not pop up again.
  const existing = (await notifee.getTriggerNotificationIds()).filter(id =>
    id.startsWith(ID_PREFIX) && !(/-s\d+$/.test(id) && [...live].some(p => id.startsWith(p))),
  );
  if (existing.length) { await notifee.cancelTriggerNotifications(existing); }
  if (nags.length === 0) { pushNagWidgetState().catch(() => {}); return 0; }
  await ensureNagChannel();
  fires.sort((a, b) => a.at - b.at);
  const batch = fires.slice(0, MAX_TRIGGERS);
  for (const f of batch) {
    await createNagTrigger(f.nag, f.dueAt, f.at, triggerId(f.nag.id, f.dueAt, f.n));
  }
  pushNagWidgetState().catch(e => diag('nag.widget.fail', String(e)));
  return batch.length;
}

/** Repaint the home-screen nag widget with the next undone occurrence. */
export async function pushNagWidgetState(): Promise<void> {
  const next = await nextNag();
  await nativeSetNagWidgetState(JSON.stringify({
    next: next
      ? {nag_id: next.nag.id, due_at: next.dueAt, due_ms: Date.parse(next.dueAt), title: next.nag.title, countdown: next.nag.countdown}
      : null,
  }));
}

/** Fold widget Done taps made while we were away, then re-plan + repaint.
 *  Call at launch and on every foreground. */
export async function syncNagWidget(): Promise<void> {
  const pending = await nativeGetPendingNagDones();
  if (pending.length) {
    await nativeClearPendingNagDones();
    const nags = await getNags();
    for (const p of pending as {nag_id?: number; due_at?: string}[]) {
      const nag = nags.find(n => n.id === p.nag_id);
      if (nag && p.due_at) { await markNagDone(nag, p.due_at); }
    }
  }
  await syncNagTriggers();
}

/** Mark one occurrence done (or undone) and log a small-task note on that day. */
export async function markNagDone(nag: Nag, dueAt: string, done = true): Promise<void> {
  // Idempotent: a widget Done drained after a notification Done must not log twice.
  if (done && (await getNagDoneMap([nag.id])).has(`${nag.id}|${dueAt}`)) { return; }
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
      // Refill the trigger window: with the app not foregrounded for days the
      // 60-trigger batch would otherwise run dry.
      await syncNagTriggers();
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
