import type {Day, Entry} from '../../../../src/types/index.ts';
import type {QueueItem} from '../../main/queue.ts';

/**
 * The optimistic overlay: what the mirror would look like once every queued
 * command has landed. Pure — the renderer applies it over each query result.
 *
 * - `entries.create` on this date → a pending row with a negative id and its
 *   queue id, so the UI can edit/remove it in the queue.
 * - `entries.update` → fields merged over the mirror row.
 * - `entries.delete` → the row disappears.
 * - `days.update` → fields merged over the day.
 */
export type PendingEntry = Entry & {queueId?: string; pending?: boolean};

interface EntryArgs {
  title?: string | null;
  body?: string | null;
  activity_type?: Entry['activity_type'];
  project_id?: number | null;
  duration_sec?: number | null;
  time_from?: string | null;
  time_to?: string | null;
  is_overtime?: boolean;
  is_small_task?: boolean;
  is_todo?: boolean;
  parent_id?: number | null;
  tagNames?: string[];
  entry_type?: Entry['entry_type'];
}

function tagsFromNames(names: string[] | undefined, existing: Entry['tags']): Entry['tags'] {
  if (!names) return existing;
  return names.map((name, i) => ({id: -(i + 1), name, created_at: ''}));
}

export function applyPendingEntries(
  entries: Entry[],
  queue: QueueItem[],
  date: string,
  projects: {id: number; name: string; type: 'work' | 'personal' | 'other'}[] = [],
): PendingEntry[] {
  let out: PendingEntry[] = entries.map(e => ({...e}));
  const projectOf = (id: number | null | undefined) =>
    id == null ? null : (projects.find(p => p.id === id) ?? null);
  let seq = 0;
  for (const item of queue) {
    if (item.fn === 'entries.create') {
      const [d, params] = item.args as [string, EntryArgs];
      if (d !== date) continue;
      seq += 1;
      const p = projectOf(params.project_id);
      out.push({
        id: -seq,
        day_id: -1,
        entry_type: params.entry_type ?? 'note',
        activity_type: params.activity_type ?? 'work',
        project_id: params.project_id ?? null,
        parent_id: params.parent_id ?? null,
        tally: null,
        title: params.title ?? null,
        body: params.body ?? null,
        file_path: null,
        thumbnail_path: null,
        duration_sec: params.duration_sec ?? null,
        time_from: params.time_from ?? null,
        time_to: params.time_to ?? null,
        latitude: null,
        longitude: null,
        location_label: null,
        is_todo: Boolean(params.is_todo),
        is_overtime: Boolean(params.is_overtime),
        is_small_task: Boolean(params.is_small_task),
        scheduled_date: null,
        completed_at: null,
        reminder_at: null,
        created_at: item.createdAt,
        updated_at: item.createdAt,
        tags: tagsFromNames(params.tagNames, []),
        project: p ? {...p, archived: false, created_at: '', updated_at: ''} : null,
        queueId: item.id,
        pending: true,
      });
    } else if (item.fn === 'entries.update') {
      const [id, fields] = item.args as [number, EntryArgs];
      out = out.map(e => {
        if (e.id !== id) return e;
        const {tagNames, ...rest} = fields;
        const merged: PendingEntry = {...e, ...rest, pending: true};
        merged.tags = tagsFromNames(tagNames, e.tags);
        if ('project_id' in fields) {
          const p = projectOf(fields.project_id);
          merged.project = p ? {...p, archived: false, created_at: '', updated_at: ''} : null;
        }
        return merged;
      });
    } else if (item.fn === 'entries.delete') {
      const [id] = item.args as [number];
      out = out.filter(e => e.id !== id);
    } else if (item.fn === 'entries.setTodoDone') {
      const [id, done] = item.args as [number, boolean];
      out = out.map(e =>
        e.id === id ? {...e, completed_at: done ? item.createdAt : null, pending: true} : e,
      );
    }
  }
  return out;
}

export function applyPendingDay(day: Day | null, queue: QueueItem[], date: string): (Day & {pending?: boolean}) | null {
  let out: (Day & {pending?: boolean}) | null = day ? {...day} : null;
  for (const item of queue) {
    if (item.fn !== 'days.update') continue;
    const [d, fields] = item.args as [string, Partial<Day>];
    if (d !== date) continue;
    out = {
      ...(out ?? {
        id: -1,
        date,
        started_at: null,
        ended_at: null,
        started_at_2: null,
        ended_at_2: null,
        started_at_source: null,
        ended_at_source: null,
        notes: null,
        created_at: '',
        updated_at: '',
      }),
      ...fields,
      pending: true,
    };
  }
  return out;
}
