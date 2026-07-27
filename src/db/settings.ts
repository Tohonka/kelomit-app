import {getDB} from './database';
import type {Settings, ActivityType} from '../types';
import {parsePayPeriodStartDay} from '../utils/payPeriod';

export async function getSetting(key: string): Promise<string | null> {
  const db = getDB();
  const result = await db.execute(
    'SELECT value FROM settings WHERE key = ?;',
    [key],
  );
  if (!result.rows || result.rows.length === 0) {
    return null;
  }
  return (result.rows[0] as Record<string, unknown>).value as string | null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDB();
  await db.execute(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);',
    [key, value],
  );
}

/** Raw key→value map of every settings row. Use for keys not in the typed
 *  Settings interface (theme_mode, show_week_numbers, time_selector_mode, …). */
export async function getRawSettings(): Promise<Record<string, string>> {
  const db = getDB();
  const result = await db.execute('SELECT key, value FROM settings;');
  const map: Record<string, string> = {};
  for (const row of result.rows ?? []) {
    const r = row as Record<string, unknown>;
    map[r.key as string] = r.value as string;
  }
  return map;
}

export async function getAllSettings(): Promise<Settings> {
  const map = await getRawSettings();
  return {
    gps_enabled: map.gps_enabled !== 'false',
    gps_interval_ms: parseInt(map.gps_interval_ms ?? '60000', 10),
    default_activity_type: (map.default_activity_type ?? 'work') as ActivityType,
    default_project_id: map.default_project_id
      ? parseInt(map.default_project_id, 10)
      : null,
    usual_start: map.usual_start || null,
    usual_end: map.usual_end || null,
    prefill_from_usual: map.prefill_from_usual === 'true',
    pay_period_start_day: parsePayPeriodStartDay(
      map.pay_period_start_day,
    ),
  };
}
