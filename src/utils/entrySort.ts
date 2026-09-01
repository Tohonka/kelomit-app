import type {Entry, ActivityType} from '../types';

/** Day-list ordering/grouping mode. Cycles in this order via the sort pill. */
export type DayListMode = 'time_desc' | 'time_asc' | 'project' | 'type';

export const DAY_LIST_MODES: DayListMode[] = [
  'time_desc',
  'time_asc',
  'project',
  'type',
];

export function nextDayListMode(mode: DayListMode): DayListMode {
  const i = DAY_LIST_MODES.indexOf(mode);
  return DAY_LIST_MODES[(i + 1) % DAY_LIST_MODES.length];
}

export interface EntryGroupItem {
  entry: Entry;
  /** Direct subnotes (schema v26), oldest first. Empty for leaf notes. */
  subnotes: Entry[];
}

export interface EntryGroup {
  /** Stable React key. */
  key: string;
  /**
   * Header text, or null for the ungrouped time modes (no header rendered).
   * For 'type' mode this is the ActivityType so the caller can translate it.
   */
  title: string | null;
  items: EntryGroupItem[];
}

// time_from is a full datetime string (see entries.ts strftime usage); for
// duration-only entries it's null, so fall back to created_at. Both compare
// lexically within a single day.
const sortKey = (e: Entry): string => e.time_from ?? e.created_at;

const byTimeDesc = (a: Entry, b: Entry) => sortKey(b).localeCompare(sortKey(a));
const byTimeAsc = (a: Entry, b: Entry) => sortKey(a).localeCompare(sortKey(b));

const ACTIVITY_ORDER: ActivityType[] = ['work', 'personal_work', 'personal'];

/**
 * Order/group entries for the day list. Within grouped modes, entries are
 * newest-first inside each group. Subnotes nest under their parent (oldest
 * first); a subnote whose parent isn't in the input is shown top-level rather
 * than dropped. Pure — UI/translation stays in the caller.
 */
export function groupEntries(all: Entry[], mode: DayListMode): EntryGroup[] {
  const ids = new Set(all.map(e => e.id));
  const children = new Map<number, Entry[]>();
  const entries: Entry[] = [];
  for (const e of all) {
    if (e.parent_id != null && ids.has(e.parent_id)) {
      const list = children.get(e.parent_id);
      if (list) { list.push(e); } else { children.set(e.parent_id, [e]); }
    } else {
      entries.push(e);
    }
  }
  const wrap = (list: Entry[]): EntryGroupItem[] =>
    list.map(entry => ({entry, subnotes: (children.get(entry.id) ?? []).sort(byTimeAsc)}));

  if (mode === 'time_asc') {
    return [{key: 'all', title: null, items: wrap([...entries].sort(byTimeAsc))}];
  }
  if (mode === 'time_desc') {
    return [{key: 'all', title: null, items: wrap([...entries].sort(byTimeDesc))}];
  }

  if (mode === 'type') {
    return ACTIVITY_ORDER.map(type => ({
      key: type,
      title: type,
      items: wrap(entries.filter(e => e.activity_type === type).sort(byTimeDesc)),
    })).filter(g => g.items.length > 0);
  }

  // mode === 'project': one group per project, alphabetical, "No project" last.
  const buckets = new Map<number | null, Entry[]>();
  for (const e of entries) {
    const id = e.project?.id ?? null;
    const list = buckets.get(id);
    if (list) {
      list.push(e);
    } else {
      buckets.set(id, [e]);
    }
  }
  const named: EntryGroup[] = [];
  let noProject: EntryGroup | null = null;
  for (const [id, list] of buckets) {
    const sorted = wrap(list.sort(byTimeDesc));
    if (id == null) {
      noProject = {key: 'no-project', title: null, items: sorted};
    } else {
      named.push({key: `p-${id}`, title: list[0].project!.name, items: sorted});
    }
  }
  named.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
  return noProject ? [...named, noProject] : named;
}
