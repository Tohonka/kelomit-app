import {create} from 'zustand';
import {
  getEntriesForDay,
  createEntry,
  updateEntry,
  deleteEntry,
  setTodoCompleted,
  type CreateEntryParams,
} from '../db/entries';
import {resolveTimerParent} from '../services/timerSubnotes';
import type {Entry} from '../types';

interface EntryState {
  entriesByDay: Record<number, Entry[]>;
  isLoading: boolean;
  error: string | null;
  loadEntriesForDay: (dayId: number) => Promise<void>;
  setEntriesForDay: (dayId: number, entries: Entry[]) => void;
  addEntry: (params: CreateEntryParams) => Promise<Entry>;
  editEntry: (
    id: number,
    fields: Parameters<typeof updateEntry>[1],
    dayId: number,
  ) => Promise<void>;
  removeEntry: (id: number, dayId: number) => Promise<void>;
  setTodoDone: (id: number, dayId: number, done: boolean) => Promise<void>;
  /** Drop the cache so day screens reload fresh entries — used after a
   *  tag/project merge or rename rewrites historical notes. */
  reset: () => void;
}

export const useEntryStore = create<EntryState>(set => ({
  entriesByDay: {},
  isLoading: false,
  error: null,

  reset: () => set({entriesByDay: {}}),

  loadEntriesForDay: async (dayId: number) => {
    set({isLoading: true, error: null});
    try {
      const entries = await getEntriesForDay(dayId);
      set(state => ({
        entriesByDay: {...state.entriesByDay, [dayId]: entries},
        isLoading: false,
      }));
    } catch (e) {
      set({error: String(e), isLoading: false});
    }
  },

  setEntriesForDay: (dayId, entries) =>
    set(state => ({
      entriesByDay: {...state.entriesByDay, [dayId]: entries},
    })),

  addEntry: async (params: CreateEntryParams) => {
    // While a timer runs, new notes become subnotes of its lazily created
    // note. Explicit subnotes (Part A flow) and scheduled to-dos are left alone.
    const parent_id =
      params.parent_id ?? (params.is_todo ? null : await resolveTimerParent());
    const entry = await createEntry({...params, parent_id});
    set(state => {
      const existing = state.entriesByDay[params.day_id] ?? [];
      return {
        entriesByDay: {
          ...state.entriesByDay,
          [params.day_id]: [entry, ...existing],
        },
      };
    });
    return entry;
  },

  editEntry: async (id, fields, dayId) => {
    await updateEntry(id, fields);
    const entries = await getEntriesForDay(dayId);
    set(state => ({
      entriesByDay: {...state.entriesByDay, [dayId]: entries},
    }));
  },

  removeEntry: async (id, dayId) => {
    await deleteEntry(id);
    set(state => ({
      entriesByDay: {
        ...state.entriesByDay,
        [dayId]: (state.entriesByDay[dayId] ?? []).filter(e => e.id !== id),
      },
    }));
  },

  setTodoDone: async (id, dayId, done) => {
    await setTodoCompleted(id, done ? new Date().toISOString() : null);
    const entries = await getEntriesForDay(dayId);
    set(state => ({
      entriesByDay: {...state.entriesByDay, [dayId]: entries},
    }));
  },
}));
