import {evaluateEndOfDay, initialEodState, type EodState, type EodInput} from '../src/services/endOfDay';

const DAY = '2026-06-17';

// Build instants in LOCAL time so they round-trip against hhmmToIsoOn (which is
// local), keeping the tests deterministic regardless of the runner's timezone.
function atLocal(h: number, min = 0): string {
  return new Date(2026, 5, 17, h, min, 0).toISOString();
}
function hhmm(h: number, min = 0): string {
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function run(events: Omit<EodInput, 'endedAtSet' | 'dayStarted'>[], opts?: {dayStarted?: boolean}) {
  let state: EodState = initialEodState();
  const commits: {time: string; confirm: boolean}[] = [];
  for (const ev of events) {
    const res = evaluateEndOfDay(state, {
      ...ev,
      endedAtSet: commits.length > 0, // once committed, treat end as set
      dayStarted: opts?.dayStarted ?? true,
    });
    state = res.state;
    if (res.action.type === 'commit') {
      commits.push({time: res.action.time, confirm: res.action.confirm});
    }
  }
  return {state, commits};
}

describe('evaluateEndOfDay', () => {
  it('commits the exit time on an on-time departure (within 30 min of usual end)', () => {
    const {commits} = run([
      {event: 'work_exit', now: atLocal(16, 10), dayDate: DAY, usualEnd: hhmm(16, 0)},
    ]);
    expect(commits).toEqual([{time: atLocal(16, 10), confirm: false}]);
  });

  it('does not commit immediately on an off-time exit; waits', () => {
    const {commits, state} = run([
      {event: 'work_exit', now: atLocal(13, 0), dayDate: DAY, usualEnd: hhmm(17, 0)},
    ]);
    expect(commits).toEqual([]);
    expect(state.pendingExit).toBe(atLocal(13, 0));
  });

  it('commits the original exit time after being away > 1 h (off-time)', () => {
    const {commits} = run([
      {event: 'work_exit', now: atLocal(13, 0), dayDate: DAY, usualEnd: hhmm(17, 0)},
      {event: 'tick', now: atLocal(13, 45), dayDate: DAY, usualEnd: hhmm(17, 0)}, // <1h, nothing
      {event: 'tick', now: atLocal(14, 5), dayDate: DAY, usualEnd: hhmm(17, 0)}, // >1h
    ]);
    // committed exit time (13:00), and 13:00 vs 17:00 differs > 1h → confirm
    expect(commits).toEqual([{time: atLocal(13, 0), confirm: true}]);
  });

  it('does NOT confirm when the committed end is within 1 h of usual', () => {
    const {commits} = run([
      {event: 'work_exit', now: atLocal(17, 40), dayDate: DAY, usualEnd: hhmm(17, 0)}, // >30m so pending
      {event: 'tick', now: atLocal(18, 45), dayDate: DAY, usualEnd: hhmm(17, 0)}, // >1h away
    ]);
    // 17:40 vs 17:00 = 40 min ≤ 1h → no confirm
    expect(commits).toEqual([{time: atLocal(17, 40), confirm: false}]);
  });

  it('cancels the pending exit when the user returns to work (coffee run)', () => {
    const {commits, state} = run([
      {event: 'work_exit', now: atLocal(13, 0), dayDate: DAY, usualEnd: hhmm(17, 0)},
      {event: 'work_enter', now: atLocal(13, 20), dayDate: DAY, usualEnd: hhmm(17, 0)},
      {event: 'tick', now: atLocal(14, 30), dayDate: DAY, usualEnd: hhmm(17, 0)}, // would've been >1h
    ]);
    expect(commits).toEqual([]);
    expect(state.pendingExit).toBeNull();
  });

  it('uses home arrival as the end when no usual time is set', () => {
    const {commits} = run([
      {event: 'work_exit', now: atLocal(15, 0), dayDate: DAY, usualEnd: null},
      {event: 'home_enter', now: atLocal(15, 30), dayDate: DAY, usualEnd: null},
    ]);
    expect(commits).toEqual([{time: atLocal(15, 30), confirm: false}]);
  });

  it('ignores home arrival when a usual time IS set (1h rule governs instead)', () => {
    const {commits} = run([
      {event: 'work_exit', now: atLocal(13, 0), dayDate: DAY, usualEnd: hhmm(17, 0)},
      {event: 'home_enter', now: atLocal(13, 20), dayDate: DAY, usualEnd: hhmm(17, 0)},
    ]);
    expect(commits).toEqual([]);
  });

  it('does not set a home-arrival end when the day never started', () => {
    const {commits} = run(
      [{event: 'home_enter', now: atLocal(15, 0), dayDate: DAY, usualEnd: null}],
      {dayStarted: false},
    );
    expect(commits).toEqual([]);
  });

  it('never overwrites an end once committed', () => {
    const {commits} = run([
      {event: 'work_exit', now: atLocal(16, 10), dayDate: DAY, usualEnd: hhmm(16, 0)}, // commits
      {event: 'work_exit', now: atLocal(18, 0), dayDate: DAY, usualEnd: hhmm(16, 0)}, // endedAtSet → ignored
      {event: 'tick', now: atLocal(20, 0), dayDate: DAY, usualEnd: hhmm(16, 0)},
    ]);
    expect(commits).toHaveLength(1);
    expect(commits[0].time).toBe(atLocal(16, 10));
  });
});
