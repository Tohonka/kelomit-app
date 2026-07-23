import notifee, {
  AndroidImportance,
  AuthorizationStatus,
  TriggerType,
  type TimestampTrigger,
} from '@notifee/react-native';
import i18n from '../i18n';
import type {Entry} from '../types';

const CHANNEL_ID = 'todo-reminders';

/** Create the Android notification channels. Safe to call repeatedly. */
export async function ensureNotificationChannel(): Promise<void> {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: i18n.t('todo.channelName'),
    importance: AndroidImportance.HIGH,
  });
}

function dayEndNotifId(dayId: number): string {
  return `dayend-${dayId}`;
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
