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
 * Turn a finished session into the params for a normal note entry. Records the
 * `time_from`/`time_to` span as the source of truth (not `duration_sec`): the
 * hours model can place it precisely AND the elapsed time is derivable from the
 * span, whereas a bare duration can't be turned back into a from–to. The entry's
 * own `created_at` (set on insert ≈ stop time) is the end-time stamp.
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
    duration_sec: null,
    time_from: session.started_at,
    time_to: endedAt.toISOString(),
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    tagIds,
  };
}

/** Total tracked work ms: closed segments + the running one. Pauses excluded. */
export function sessionElapsedMs(session: ActiveSession, now: Date = new Date()): number {
  const acc = session.accumulated_ms ?? 0;
  if (session.paused_at) {
    return acc;
  }
  return acc + elapsedSeconds(session.started_at, now) * 1000;
}

/**
 * Timer-note title: "<name> #<tally>" for project notes, "<name> <HH:MM>"
 * otherwise, null when there's nothing to build from (caller falls back to the
 * i18n "Timer note" title). `name` falls back to the project name.
 */
export function formatTimerTitle(input: {
  name: string | null;
  projectName: string | null;
  tally: number | null;
  timeLabel: string;
}): string | null {
  const name = input.name?.trim() || input.projectName?.trim() || null;
  if (!name) {
    return null;
  }
  return input.tally != null ? `${name} #${input.tally}` : `${name} ${input.timeLabel}`;
}
