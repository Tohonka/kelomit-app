import type {ActivityEvent} from '../types';
import {getDB} from './database';
import {GPS_RETENTION_DAYS, retentionCutoffIso} from './gps';

export async function insertActivityEvent(
  event: ActivityEvent,
): Promise<boolean> {
  const result = await getDB().execute(
    `INSERT OR IGNORE INTO activity_events (activity, transition, timestamp)
     VALUES (?, ?, ?);`,
    [event.activity, event.transition, event.timestamp],
  );
  return (result.rowsAffected ?? 0) > 0;
}

export async function getActivityEventsThrough(
  endIso: string,
): Promise<ActivityEvent[]> {
  const result = await getDB().execute(
    `SELECT activity, transition, timestamp
     FROM activity_events
     WHERE timestamp <= ?
     ORDER BY timestamp ASC, id ASC;`,
    [endIso],
  );
  return (result.rows ?? []).map(row => ({
    activity: row.activity as ActivityEvent['activity'],
    transition: row.transition as ActivityEvent['transition'],
    timestamp: row.timestamp as string,
  }));
}

export async function pruneActivityEventsOlderThan(
  days = GPS_RETENTION_DAYS,
): Promise<void> {
  await getDB().execute(
    'DELETE FROM activity_events WHERE timestamp < ?;',
    [retentionCutoffIso(Date.now(), days)],
  );
}
