import {getDB} from './database';
import {updateDay} from './days';
import type {DayEndConfirmation} from '../types';

type RawRow = Record<string, unknown>;

// Lightweight change notifier so the in-app banner can react immediately when a
// confirmation is created (GPS inference) or answered, without polling.
let _listeners: (() => void)[] = [];
export function onDayEndChange(cb: () => void): () => void {
  _listeners.push(cb);
  return () => {
    _listeners = _listeners.filter(l => l !== cb);
  };
}
function notifyChange(): void {
  for (const l of _listeners) {
    l();
  }
}

/** Create a pending confirmation for a day's inferred end. Clears any earlier
 *  unanswered one for the same day first (no id reuse — old rows stay logged
 *  only if answered; unanswered dupes are removed to avoid stacking prompts). */
export async function createDayEndConfirmation(
  dayId: number,
  proposedEnd: string,
): Promise<number> {
  const db = getDB();
  await db.execute(
    'DELETE FROM day_end_confirmations WHERE day_id = ? AND confirmed IS NULL;',
    [dayId],
  );
  const res = await db.execute(
    'INSERT INTO day_end_confirmations (day_id, proposed_end) VALUES (?, ?) RETURNING id;',
    [dayId, proposedEnd],
  );
  notifyChange();
  return (res.rows![0] as RawRow).id as number;
}

export interface PendingDayEnd {
  id: number;
  dayId: number;
  date: string;
  proposedEnd: string;
}

/** The most recent unanswered confirmation (with its day's date), or null. */
export async function getPendingDayEndConfirmation(): Promise<PendingDayEnd | null> {
  const db = getDB();
  const res = await db.execute(
    `SELECT c.id, c.day_id, c.proposed_end, d.date
       FROM day_end_confirmations c JOIN days d ON d.id = c.day_id
      WHERE c.confirmed IS NULL
      ORDER BY c.created_at DESC LIMIT 1;`,
  );
  if (!res.rows || res.rows.length === 0) {
    return null;
  }
  const r = res.rows[0] as RawRow;
  return {
    id: r.id as number,
    dayId: r.day_id as number,
    date: r.date as string,
    proposedEnd: r.proposed_end as string,
  };
}

/** Record the user's answer to a confirmation. */
export async function respondDayEndConfirmation(id: number, confirmed: boolean): Promise<void> {
  const db = getDB();
  await db.execute(
    "UPDATE day_end_confirmations SET confirmed = ?, responded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?;",
    [confirmed ? 1 : 0, id],
  );
}

/**
 * Apply a Yes/No answer: Yes keeps the proposed end, No clears it, and the
 * decision is logged. Used by both the notification action handler and the
 * in-app banner.
 */
export async function applyDayEndResponse(
  confirmationId: number,
  dayId: number,
  proposedEnd: string,
  confirmed: boolean,
): Promise<void> {
  await updateDay(dayId, {ended_at: confirmed ? proposedEnd : null});
  await respondDayEndConfirmation(confirmationId, confirmed);
  notifyChange();
}

export type {DayEndConfirmation};
