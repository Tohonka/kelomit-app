import notifee, {
  AndroidImportance,
  AuthorizationStatus,
  EventType,
  TriggerType,
  type Event,
  type TimestampTrigger,
} from '@notifee/react-native';
import i18n from '../i18n';
import {ensureDBReady} from '../db/database';
import {applyDayEndResponse} from '../db/dayConfirmations';
import {formatTime} from '../utils/dateUtils';
import type {Entry} from '../types';

const CHANNEL_ID = 'todo-reminders';
const DAY_END_CHANNEL_ID = 'day-end';

/** Create the Android notification channels. Safe to call repeatedly. */
export async function ensureNotificationChannel(): Promise<void> {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: i18n.t('todo.channelName'),
    importance: AndroidImportance.HIGH,
  });
  await notifee.createChannel({
    id: DAY_END_CHANNEL_ID,
    name: i18n.t('dayEnd.channelName'),
    importance: AndroidImportance.HIGH,
  });
}

function dayEndNotifId(dayId: number): string {
  return `dayend-${dayId}`;
}

/** Post a "was this the end of your workday?" Yes/No notification. */
export async function displayDayEndConfirmation(
  dayId: number,
  proposedEnd: string,
  confirmationId: number,
): Promise<void> {
  await ensureNotificationChannel();
  await notifee.displayNotification({
    id: dayEndNotifId(dayId),
    title: i18n.t('dayEnd.notificationTitle'),
    body: i18n.t('dayEnd.question', {time: formatTime(proposedEnd)}),
    data: {
      type: 'dayend',
      dayId: String(dayId),
      proposedEnd,
      confirmationId: String(confirmationId),
    },
    android: {
      channelId: DAY_END_CHANNEL_ID,
      pressAction: {id: 'default'},
      smallIcon: 'ic_launcher',
      actions: [
        {title: i18n.t('common.yes'), pressAction: {id: 'dayend-yes'}},
        {title: i18n.t('common.no'), pressAction: {id: 'dayend-no'}},
      ],
    },
  });
}

/**
 * Shared notifee event handler for the day-end Yes/No actions. Registered for
 * both foreground and background (index.js) so it works whether the app is open
 * or killed. Returns true if it handled a day-end action.
 */
export async function handleNotifeeEvent({type, detail}: Event): Promise<boolean> {
  if (type !== EventType.ACTION_PRESS) {
    return false;
  }
  const {pressAction, notification} = detail;
  const data = notification?.data;
  if (!pressAction || !data || data.type !== 'dayend') {
    return false;
  }
  if (pressAction.id !== 'dayend-yes' && pressAction.id !== 'dayend-no') {
    return false;
  }
  await ensureDBReady();
  await applyDayEndResponse(
    Number(data.confirmationId),
    Number(data.dayId),
    String(data.proposedEnd),
    pressAction.id === 'dayend-yes',
  );
  if (notification?.id) {
    await notifee.cancelNotification(notification.id);
  }
  return true;
}

/** Register the foreground notifee handler. Returns an unsubscribe fn. */
export function registerForegroundNotifeeHandler(): () => void {
  return notifee.onForegroundEvent(handleNotifeeEvent);
}

/** Dismiss a day-end notification (e.g. after answering via the in-app banner). */
export async function cancelDayEndConfirmation(dayId: number): Promise<void> {
  await notifee.cancelNotification(dayEndNotifId(dayId));
}

/** Ask for notification permission (Android 13+ POST_NOTIFICATIONS). */
export async function requestNotificationPermission(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  return (
    settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
    settings.authorizationStatus === AuthorizationStatus.PROVISIONAL
  );
}

function reminderId(entryId: number): string {
  return `todo-${entryId}`;
}

/** Cancel any pending reminder for an entry. */
export async function cancelTodoReminder(entryId: number): Promise<void> {
  await notifee.cancelTriggerNotification(reminderId(entryId));
}

/**
 * (Re)schedule a reminder for a to-do entry. Cancels any existing one first.
 * No-op when there's no future reminder time or the to-do is already completed.
 */
export async function scheduleTodoReminder(entry: Entry): Promise<void> {
  await cancelTodoReminder(entry.id);
  if (!entry.reminder_at || entry.completed_at) {
    return;
  }
  const timestamp = new Date(entry.reminder_at).getTime();
  if (Number.isNaN(timestamp) || timestamp <= Date.now()) {
    return;
  }
  await ensureNotificationChannel();
  const trigger: TimestampTrigger = {type: TriggerType.TIMESTAMP, timestamp};
  await notifee.createTriggerNotification(
    {
      id: reminderId(entry.id),
      title: i18n.t('todo.notificationTitle'),
      body: entry.title?.trim() || i18n.t('todo.notificationBody'),
      android: {
        channelId: CHANNEL_ID,
        pressAction: {id: 'default'},
        smallIcon: 'ic_launcher',
      },
    },
    trigger,
  );
}
