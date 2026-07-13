/**
 * End-of-day inference (redesign 2026-07-13).
 *
 * Pure, re-runnable function over a day's persisted geofence crossings — no
 * timers, no I/O, no module state. Crossings come from the crossing store
 * (OS geofencing + live-fix backstop), so this survives parked/doze windows.
 *
 * Rules (single-block day; out-of-office counts as work):
 *  - start = first work arrival of the day.
 *  - A work departure opens a pending end at that departure time. It resolves:
 *      home arrival        -> commit that departure time, silent (no confirm);
 *      re-enter any work   -> cancel (stepped out / switched offices);
 *      away > 1h, no home  -> commit that departure time, ask the user.
 *  - Commute home is never counted (end = the departure, not the home arrival).
 *  - Never proposes a value that is already set.
 */

const AWAY_THRESHOLD_MS = 3_600_000; // 1 h

export interface Crossing {
  locationId: number;
  kind: 'work' | 'home' | 'other';
  type: 'enter' | 'exit';
  time: string; // ISO
}

export interface DetectionInput {
  crossings: Crossing[]; // ordered ascending by time
  now: string; // ISO — for resolving the away>1h rule
  startedAtSet: boolean; // day.started_at already set?
  endedAtSet: boolean; // day.ended_at already set?
}

export interface DetectionResult {
  startedAt: string | null; // propose this start (only when !startedAtSet)
  endedAt: string | null; // propose this end (only when !endedAtSet)
  confirmEnd: boolean; // ask the user to confirm the proposed end
}

function ms(iso: string): number {
  return new Date(iso).getTime();
}

export function inferDay(input: DetectionInput): DetectionResult {
  const {crossings, now, startedAtSet, endedAtSet} = input;
  const result: DetectionResult = {startedAt: null, endedAt: null, confirmEnd: false};

  // START — first work arrival.
  if (!startedAtSet) {
    const firstWorkEnter = crossings.find(c => c.kind === 'work' && c.type === 'enter');
    result.startedAt = firstWorkEnter ? firstWorkEnter.time : null;
  }

  if (endedAtSet) {
    return result;
  }

  // END — fold crossings into "inside any work location" + a pending departure.
  const workInside = new Set<number>();
  let pendingExit: string | null = null;

  for (const c of crossings) {
    if (c.kind === 'work') {
      if (c.type === 'enter') {
        workInside.add(c.locationId);
        pendingExit = null; // re-entering work cancels a pending departure
      } else {
        workInside.delete(c.locationId);
        if (workInside.size === 0) {
          pendingExit = c.time; // left all work — open a pending end
        }
      }
    } else if (c.kind === 'home' && c.type === 'enter' && pendingExit !== null) {
      // work -> home: commit the departure time, no confirmation needed.
      result.endedAt = pendingExit;
      result.confirmEnd = false;
      return result;
    }
    // 'other' places are ignored for day boundaries.
  }

  // Still away and no home arrival — commit once past the away threshold, and ask.
  if (pendingExit !== null && ms(now) - ms(pendingExit) > AWAY_THRESHOLD_MS) {
    result.endedAt = pendingExit;
    result.confirmEnd = true;
  }

  return result;
}
