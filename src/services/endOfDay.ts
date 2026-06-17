import {hhmmToIsoOn} from '../utils/dateUtils';

/**
 * End-of-day inference (Iteration 3 Phase 8.1).
 *
 * Pure, timestamp-driven reducer — NO timers. The "still away for > 1 h" rule is
 * resolved by feeding a `tick` on each incoming GPS fix and comparing timestamps,
 * so it survives Android doze (a setTimeout would not). Kept separate from
 * gpsService so it can be unit-tested with synthetic event sequences.
 *
 * Rules:
 *  - Leave work within ±30 min of the usual end time → that exit is the end.
 *  - No usual end set → arrival home is the end (if the day had a start).
 *  - Otherwise an off-time exit is "pending": if the user is still away > 1 h it
 *    commits the *original exit* time; re-entering work cancels it (a coffee run).
 *  - When a committed end differs from the usual time by > 1 h, `confirm` is set
 *    so the caller can ask the user (Phase 8.2). The end is still committed.
 *  - Never proposes an end when one is already set (auto-fill only).
 */

export type EodEvent = 'work_exit' | 'work_enter' | 'home_enter' | 'tick';

export interface EodState {
  /** ISO time of an unresolved work departure, or null. */
  pendingExit: string | null;
}

export interface EodInput {
  event: EodEvent;
  now: string; // ISO of the current fix
  dayDate: string; // YYYY-MM-DD of the day being evaluated
  usualEnd: string | null; // "HH:mm" or null
  endedAtSet: boolean; // is day.ended_at already set?
  dayStarted: boolean; // is day.started_at set?
}

export type EodAction =
  | {type: 'none'}
  | {type: 'commit'; time: string; confirm: boolean};

const HALF_HOUR_S = 30 * 60;
const HOUR_S = 60 * 60;

function epochS(iso: string): number {
  return Math.round(new Date(iso).getTime() / 1000);
}

export function initialEodState(): EodState {
  return {pendingExit: null};
}

export function evaluateEndOfDay(
  state: EodState,
  input: EodInput,
): {state: EodState; action: EodAction} {
  const {event, now, dayDate, usualEnd, endedAtSet, dayStarted} = input;
  const keep = {state, action: {type: 'none'} as EodAction};

  // Re-entering work always clears a pending exit, even if the end is set.
  if (event === 'work_enter') {
    return {state: {pendingExit: null}, action: {type: 'none'}};
  }
  // Never overwrite an existing end (manual or already auto-filled).
  if (endedAtSet) {
    return keep;
  }

  const usualEndIso = usualEnd ? hhmmToIsoOn(dayDate, usualEnd) : null;

  switch (event) {
    case 'work_exit': {
      if (usualEndIso && Math.abs(epochS(now) - epochS(usualEndIso)) <= HALF_HOUR_S) {
        // On-time departure → confident end, no confirmation needed.
        return {state: {pendingExit: null}, action: {type: 'commit', time: now, confirm: false}};
      }
      // Off-time or no usual time → wait for the 1 h rule / home arrival.
      return {state: {pendingExit: now}, action: {type: 'none'}};
    }
    case 'home_enter': {
      // Home arrival is the fallback end only when no usual time is configured.
      if (!usualEndIso && dayStarted) {
        return {state: {pendingExit: null}, action: {type: 'commit', time: now, confirm: false}};
      }
      return keep;
    }
    case 'tick': {
      const pending = state.pendingExit;
      if (pending && epochS(now) - epochS(pending) > HOUR_S) {
        const confirm = !!usualEndIso && Math.abs(epochS(pending) - epochS(usualEndIso)) > HOUR_S;
        return {state: {pendingExit: null}, action: {type: 'commit', time: pending, confirm}};
      }
      return keep;
    }
    default:
      return keep;
  }
}
