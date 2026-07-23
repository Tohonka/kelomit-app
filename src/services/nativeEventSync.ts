import {format} from 'date-fns';
import {
  ackNativeEvents,
  parseNativeEvent,
  readNativeEvents,
  type NativeJournalEvent,
} from '../native/backgroundLocation';
import {getOrCreateDay, updateDay} from '../db/days';
import {
  createOrReplaceNativeConfirmation,
  resolveNativeConfirmation,
} from '../db/dayConfirmations';
import {recordCrossing} from './crossingStore';

function dateForTimestamp(timestamp: number): string {
  return format(new Date(timestamp), 'yyyy-MM-dd');
}

async function persistEvent(event: NativeJournalEvent): Promise<void> {
  if (event.type === 'crossing') {
    const day = await getOrCreateDay(event.localDate);
    const time = new Date(event.timestamp).toISOString();
    await recordCrossing({
      locationId: event.locationId,
      dayId: day.id,
      type: event.direction,
      latitude: event.latitude,
      longitude: event.longitude,
      time,
    });
    if (event.kind === 'work' && event.direction === 'enter' && !day.started_at) {
      await updateDay(day.id, {
        started_at: time,
        started_at_source: 'auto',
      });
    }
    return;
  }

  const proposedEnd = new Date(event.exitTimestamp).toISOString();
  const day = await getOrCreateDay(dateForTimestamp(event.exitTimestamp));
  if (event.type === 'day_end_prompted') {
    await createOrReplaceNativeConfirmation(day.id, proposedEnd, event.token);
    return;
  }

  const accepted = event.type === 'day_end_confirmed' ||
    event.type === 'day_end_assumed';
  await resolveNativeConfirmation(event.token, accepted);
  if (accepted && !day.ended_at) {
    await updateDay(day.id, {
      ended_at: proposedEnd,
      ended_at_source: 'auto',
    });
  }
}

async function reconcileOnce(): Promise<void> {
  const lines = await readNativeEvents();
  if (lines.length === 0) {
    return;
  }

  const events = lines.map(line => {
    const event = parseNativeEvent(line);
    if (!event) {
      throw new Error('Malformed native event journal entry');
    }
    return event;
  });
  for (let i = 1; i < events.length; i += 1) {
    if (events[i].sequence !== events[i - 1].sequence + 1) {
      throw new Error('Native event sequence gap');
    }
  }

  for (const event of events) {
    await persistEvent(event);
  }
  await ackNativeEvents(events[events.length - 1].sequence);
}

let reconciliation: Promise<void> = Promise.resolve();

/** Reconcile Android's durable event journal into SQLite in strict order. */
export function reconcileNativeEvents(): Promise<void> {
  const run = reconciliation.then(reconcileOnce, reconcileOnce);
  reconciliation = run.catch(() => {});
  return run;
}
