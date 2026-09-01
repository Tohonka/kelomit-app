import {
  readActiveSession,
  writeActiveSession,
  clearActiveSession,
} from '../db/activeSession';
import {getOrCreateDay} from '../db/days';
import {createEntry, getEntry, updateEntry} from '../db/entries';
import {getTimerParentId, clearTimerParent} from './timerSubnotes';
import {getOrCreateTag} from '../db/tags';
import {getAllProjects} from '../db/projects';
import {localDateOf, formatTime} from '../utils/dateUtils';
import {getLastKnownPosition} from './gpsService';
import {elapsedSeconds, sessionToEntryParams, formatTimerTitle} from './sessionLogic';
import {
  nativeGetPendingSessions,
  nativeClearPendingSessions,
} from '../native/widgetSession';
import i18n from '../i18n';
import type {ActiveSession, ActivityType, Entry} from '../types';

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
  name?: string | null;
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
    name: input.name?.trim() || null,
    accumulated_ms: 0,
    paused_at: null,
    // In-app sessions own no widget: every widget stays idle-looking and a tap
    // on any widget's Start switches to that widget's task.
    widget_id: null,
  };
  await clearTimerParent(); // never inherit a stale lazy parent row
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

/** Log one finished segment as a note; title it from name+tally if untitled. */
async function logSegment(
  session: ActiveSession,
  endedAt: Date,
  withLocation: boolean,
): Promise<StopResult> {
  const day = await getOrCreateDay(localDateOf(session.started_at));
  const tagIds: number[] = [];
  for (const name of session.tags) {
    const tag = await getOrCreateTag(name);
    tagIds.push(tag.id);
  }
  const gps = withLocation ? getLastKnownPosition() : null;
  const params = sessionToEntryParams({
    session, dayId: day.id, endedAt, tagIds,
    latitude: gps?.latitude ?? null,
    longitude: gps?.longitude ?? null,
  });
  // Subnotes captured during this segment created its note early (time_to
  // NULL): finalize that row instead of inserting a second one. Any lazy row
  // from another segment is left as-is (a 0-length note the user can edit).
  // ponytail: no reconciliation of stale rows; startSession clears the KV.
  const parentId = await getTimerParentId();
  const parent = parentId != null ? await getEntry(parentId) : null;
  let entry: Entry;
  if (parent && parent.time_to == null && parent.time_from === session.started_at) {
    await updateEntry(parent.id, {
      time_to: params.time_to,
      latitude: params.latitude,
      longitude: params.longitude,
    });
    entry = {...parent, time_to: params.time_to ?? null};
  } else {
    entry = await createEntry(params);
  }
  if (parentId != null) { await clearTimerParent(); }
  if (!session.title || !session.title.trim()) {
    let projectName: string | null = null;
    if (session.project_id != null) {
      projectName =
        (await getAllProjects(true)).find(p => p.id === session.project_id)?.name ?? null;
    }
    const title =
      formatTimerTitle({
        name: session.name ?? null,
        projectName,
        tally: entry.tally,
        timeLabel: formatTime(session.started_at),
      }) ?? i18n.t('timer.noteTitle', {time: formatTime(session.started_at)});
    await updateEntry(entry.id, {title});
  }
  return {entry, dayId: day.id};
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
  if (session.paused_at) {
    // Last segment already landed at pause time — nothing left to log.
    await clearActiveSession();
    return {entry: null, dayId: null};
  }
  const endedAt = new Date();
  if (elapsedSeconds(session.started_at, endedAt) < MIN_SESSION_SECONDS) {
    await clearActiveSession();
    return {entry: null, dayId: null};
  }
  const result = await logSegment(session, endedAt, true);
  await clearActiveSession();
  return result;
}

/**
 * Discard the active session. If notes were captured during the running
 * segment (a lazy parent row exists) the segment is logged like a stop instead
 * of orphaning the documented work.
 */
export async function cancelSession(): Promise<StopResult> {
  const session = await readActiveSession();
  const parentId = await getTimerParentId();
  if (session && !session.paused_at && parentId != null) {
    const result = await logSegment(session, new Date(), true);
    await clearActiveSession();
    return result;
  }
  await clearTimerParent();
  await clearActiveSession();
  return {entry: null, dayId: null};
}

/** Close the running segment into a note; keep the session alive, paused. */
export async function pauseSession(): Promise<StopResult> {
  const session = await readActiveSession();
  if (!session || session.paused_at) {
    return {entry: null, dayId: null};
  }
  const endedAt = new Date();
  const segmentMs = elapsedSeconds(session.started_at, endedAt) * 1000;
  const result =
    segmentMs >= MIN_SESSION_SECONDS * 1000
      ? await logSegment(session, endedAt, true)
      : {entry: null, dayId: null};
  await writeActiveSession({
    ...session,
    accumulated_ms: (session.accumulated_ms ?? 0) + segmentMs,
    paused_at: endedAt.toISOString(),
  });
  return result;
}

/** Start the next segment of a paused session. */
export async function resumeSession(): Promise<ActiveSession | null> {
  const session = await readActiveSession();
  if (!session || !session.paused_at) {
    return session;
  }
  const resumed: ActiveSession = {
    ...session,
    started_at: new Date().toISOString(),
    paused_at: null,
  };
  await writeActiveSession(resumed);
  return resumed;
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
    // No location: the widget had no fix, and stamping the current position at
    // drain time (possibly a different place) would be misleading.
    const {dayId} = await logSegment(
      {
        started_at: p.started_at,
        project_id: p.project_id,
        activity_type: p.activity_type,
        tags: p.tags,
        title: p.title,
        source: 'widget',
        name: p.name ?? null,
      },
      new Date(p.ended_at),
      false,
    );
    if (dayId != null && !dayIds.includes(dayId)) {
      dayIds.push(dayId);
    }
  }
  await nativeClearPendingSessions();
  return dayIds;
}
