import type {ActiveSession} from '../types';
import type {CreateEntryParams} from '../db/entries';

/**
 * Pure session math (no DB, no native) — the part that's reused by both the
 * in-app quick timer and the home-screen widgets, and the part worth unit
 * testing. The orchestration that touches SQLite lives in `sessionService.ts`.
 */

/** Whole seconds elapsed since the session started, never negative. */
export function elapsedSeconds(startedAtIso: string, now: Date = new Date()): number {
  const start = new Date(startedAtIso).getTime();
  return Math.max(0, Math.floor((now.getTime() - start) / 1000));
}

export interface SessionEntryInput {
  session: ActiveSession;
  /** Day the note is logged against (the session's *start* day). */
  dayId: number;
  endedAt: Date;
  /** Tag ids already resolved from `session.tags`. */
  tagIds: number[];
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Turn a finished session into the params for a normal note entry. Records both
 * `duration_sec` and the `time_from`/`time_to` span so the work-day hours model
 * can place it precisely (work outside legs is added, etc.).
 */
export function sessionToEntryParams(input: SessionEntryInput): CreateEntryParams {
  const {session, dayId, endedAt, tagIds, latitude, longitude} = input;
  return {
    day_id: dayId,
    entry_type: 'note',
    activity_type: session.activity_type,
    project_id: session.project_id,
    title: session.title,
    body: null,
    duration_sec: elapsedSeconds(session.started_at, endedAt),
    time_from: session.started_at,
    time_to: endedAt.toISOString(),
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    tagIds,
  };
}
