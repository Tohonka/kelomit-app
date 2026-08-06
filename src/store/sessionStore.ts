import {create} from 'zustand';
import {
  startSession,
  stopSession,
  pauseSession,
  resumeSession,
  cancelSession,
  getActiveSession,
  drainPendingSessions,
  type StartSessionInput,
  type StopResult,
} from '../services/sessionService';
import {useEntryStore} from './entryStore';
import type {ActiveSession} from '../types';

interface SessionState {
  active: ActiveSession | null;
  loaded: boolean;
  load: () => Promise<void>;
  /** Drain widget-finished sessions into notes, then refresh the active state
   *  and any affected days' entries. Call on app start and on resume. */
  reconcile: () => Promise<void>;
  start: (input: StartSessionInput) => Promise<void>;
  stop: () => Promise<StopResult>;
  pause: () => Promise<StopResult>;
  resume: () => Promise<void>;
  cancel: () => Promise<void>;
}

export const useSessionStore = create<SessionState>(set => ({
  active: null,
  loaded: false,

  load: async () => {
    const active = await getActiveSession();
    set({active, loaded: true});
  },

  reconcile: async () => {
    let dayIds: number[] = [];
    try {
      dayIds = await drainPendingSessions();
    } catch {
      // Draining is best-effort; never block startup over it.
    }
    const active = await getActiveSession();
    set({active, loaded: true});
    const reload = useEntryStore.getState().loadEntriesForDay;
    for (const id of dayIds) {
      await reload(id);
    }
  },

  start: async input => {
    const session = await startSession(input);
    set({active: session});
  },

  stop: async () => {
    const result = await stopSession();
    set({active: null});
    return result;
  },

  pause: async () => {
    const result = await pauseSession();
    const active = await getActiveSession();
    set({active});
    return result;
  },

  resume: async () => {
    const session = await resumeSession();
    set({active: session});
  },

  cancel: async () => {
    await cancelSession();
    set({active: null});
  },
}));
