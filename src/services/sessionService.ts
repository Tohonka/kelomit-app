import {
  readActiveSession,
  writeActiveSession,
  clearActiveSession,
} from '../db/activeSession';
import {getOrCreateDay} from '../db/days';
import {createEntry} from '../db/entries';
import {getOrCreateTag} from '../db/tags';
import {localDateOf, formatTime} from '../utils/dateUtils';
import {getLastKnownPosition} from './gpsService';
import {elapsedSeconds, sessionToEntryParams} from './sessionLogic';
import {
  nativeGetPendingSessions,
  nativeClearPendingSessions,
} from '../native/widgetSession';
import i18n from '../i18n';
import type {ActiveSession, ActivityType, Entry} from '../types';

/**
 * Give an untitled session a friendly, editable headline (e.g. "Timer note
 * 14:30") so a widget-logged note isn't blank in the list. The user can rename
 * it like any other note. A title set in-app is kept as-is.
 */
function withFallbackTitle(session: ActiveSession): ActiveSession {
  if (session.title && session.title.trim()) {
    return session;
  }
  return {
    ...session,
    title: i18n.t('timer.noteTitle', {time: formatTime(session.started_at)}),
  };
}

/**
 * Start/stop orchestration for the active time-tracking session (Phase 9).
 * Shared by the in-app quick timer and (later) the widgets — the DB-touching
 * counterpart to the pure `sessionLogic.ts`.
 */

/** Sessions shorter than this are treated as accidental taps and discarded. */
const MIN_SESSION_SECONDS = 1;

export interface StartSessionInput {
  project_id?: number | null;
  activity_type?: ActivityType;
  tags?: string[];
  title?: string | null;
  source?: ActiveSession['source'];
}

export async function startSession(input: StartSessionInput): Promise<ActiveSession> {
  const session: ActiveSession = {
    started_at: new Date().toISOString(),
    project_id: input.project_id ?? null,
    activity_type: input.activity_type ?? 'work',
    tags: (input.tags ?? []).map(t => t.trim()).filter(Boolean),
    title: input.title?.trim() || null,
    source: input.source ?? 'timer',
  };
  await writeActiveSession(session);
  return session;
}

export async function getActiveSession(): Promise<ActiveSession | null> {
  return readActiveSession();
}

export interface StopResult {
  entry: Entry | null;
  /** Day the entry was logged to, for reloading just that day. */
  dayId: number | null;
}

/**
 * Stop the active session and log it as a note. The note is attached to the day
 * the session *started* on (so a session crossing midnight lands on its start
 * day, with its full duration intact). Too-short sessions are dropped silently.
 */
export async function stopSession(): Promise<StopResult> {
  const session = await readActiveSession();
  if (!session) {
    return {entry: null, dayId: null};
  }

  const endedAt = new Date();
  if (elapsedSeconds(session.started_at, endedAt) < MIN_SESSION_SECONDS) {
    await clearActiveSession();
    return {entry: null, dayId: null};
  }

  const day = await getOrCreateDay(localDateOf(session.started_at));

  const tagIds: number[] = [];
  for (const name of session.tags) {
    const tag = await getOrCreateTag(name);
    tagIds.push(tag.id);
  }

  const gps = getLastKnownPosition();
  const entry = await createEntry(
    sessionToEntryParams({
      session: withFallbackTitle(session),
      dayId: day.id,
      endedAt,
      tagIds,
      latitude: gps?.latitude ?? null,
      longitude: gps?.longitude ?? null,
    }),
  );

  await clearActiveSession();
  return {entry, dayId: day.id};
}

/** Discard the active session without logging anything. */
export async function cancelSession(): Promise<void> {
  await clearActiveSession();
}

/**
 * Drain any sessions a home-screen widget finished while the app wasn't running
 * (Phase 9.2). Each becomes a note on its start day. Returns the affected day
 * ids so the caller can reload just those days. No-op without the native bridge.
 */
export async function drainPendingSessions(): Promise<number[]> {
  const pending = await nativeGetPendingSessions();
  if (pending.length === 0) {
    return [];
  }
  const dayIds: number[] = [];
  for (const p of pending) {
    const day = await getOrCreateDay(localDateOf(p.started_at));
    const tagIds: number[] = [];
    for (const name of p.tags) {
      const tag = await getOrCreateTag(name);
      tagIds.push(tag.id);
    }
    // No location: the widget had no fix, and stamping the current position at
    // drain time (possibly a different place) would be misleading.
    await createEntry(
      sessionToEntryParams({
        session: withFallbackTitle({
          started_at: p.started_at,
          project_id: p.project_id,
          activity_type: p.activity_type,
          tags: p.tags,
          title: p.title,
          source: 'widget',
        }),
        dayId: day.id,
        endedAt: new Date(p.ended_at),
        tagIds,
      }),
    );
    if (!dayIds.includes(day.id)) {
      dayIds.push(day.id);
    }
  }
  await nativeClearPendingSessions();
  return dayIds;
}
