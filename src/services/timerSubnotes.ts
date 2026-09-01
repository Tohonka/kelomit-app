import {create} from 'zustand';
import {getSetting, setSetting} from '../db/settings';
import {readActiveSession} from '../db/activeSession';
import {getOrCreateDay} from '../db/days';
import {getOrCreateTag} from '../db/tags';
import {createEntry} from '../db/entries';
import {localDateOf} from '../utils/dateUtils';
import {sessionToEntryParams} from './sessionLogic';
import type {ActiveSession} from '../types';

/**
 * Timer → subnotes (plan 2026-09-01 Task 3C). No `entries` row exists while a
 * timer runs, so the first note captured during a running segment lazily
 * creates that segment's note (in progress: `time_to` NULL) and later captures
 * attach to it; `sessionService.logSegment` then finalizes the row instead of
 * inserting a new one. The id lives in the settings KV — deliberately NOT
 * inside ActiveSession, which native SessionStore.kt rewrites on widget
 * pause/resume and would drop unknown fields.
 */
const KEY = 'timer_parent_entry';

/** Reactive mirror for DayView: hide the in-progress tree while running. */
export const useTimerParent = create<{parentId: number | null}>(() => ({parentId: null}));

function parse(raw: string | null): number | null {
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Current lazy parent id (also refreshes the reactive mirror). */
export async function getTimerParentId(): Promise<number | null> {
  const id = parse(await getSetting(KEY));
  useTimerParent.setState({parentId: id});
  return id;
}

export async function clearTimerParent(): Promise<void> {
  await setSetting(KEY, '');
  useTimerParent.setState({parentId: null});
}

/**
 * Parent id for a note captured now: the running segment's lazily created
 * note, or null when no timer is running (paused counts as not running —
 * that segment's note already exists as a finished row).
 */
export async function resolveTimerParent(): Promise<number | null> {
  const session = await readActiveSession();
  if (!session || session.paused_at) { return null; }
  const existing = await getTimerParentId();
  if (existing != null) { return existing; }
  const id = await createTimerParent(session);
  await setSetting(KEY, String(id));
  useTimerParent.setState({parentId: id});
  return id;
}

async function createTimerParent(session: ActiveSession): Promise<number> {
  const day = await getOrCreateDay(localDateOf(session.started_at));
  const tagIds: number[] = [];
  for (const name of session.tags) {
    tagIds.push((await getOrCreateTag(name)).id);
  }
  const entry = await createEntry({
    ...sessionToEntryParams({session, dayId: day.id, endedAt: new Date(), tagIds}),
    time_to: null, // in progress; logSegment fills it in
  });
  return entry.id;
}
