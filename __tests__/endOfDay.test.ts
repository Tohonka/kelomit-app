import {inferDay, type Crossing} from '../src/services/endOfDay';

const DAY = '2026-06-17';
function at(h: number, min = 0): string {
  return new Date(2026, 5, 17, h, min, 0).toISOString();
}
const workEnter = (h: number, m = 0, id = 1): Crossing => ({locationId: id, kind: 'work', type: 'enter', time: at(h, m)});
const workExit = (h: number, m = 0, id = 1): Crossing => ({locationId: id, kind: 'work', type: 'exit', time: at(h, m)});
const homeEnter = (h: number, m = 0): Crossing => ({locationId: 9, kind: 'home', type: 'enter', time: at(h, m)});

function infer(crossings: Crossing[], now: string, opts?: Partial<{startedAtSet: boolean; endedAtSet: boolean}>) {
  return inferDay({crossings, now, startedAtSet: opts?.startedAtSet ?? false, endedAtSet: opts?.endedAtSet ?? false});
}

describe('inferDay', () => {
  it('sets start to the first work arrival', () => {
    const r = infer([workEnter(9)], at(9, 5));
    expect(r.startedAt).toBe(at(9));
  });

  it('does not propose a start when one is already set', () => {
    const r = infer([workEnter(9)], at(9, 5), {startedAtSet: true});
    expect(r.startedAt).toBeNull();
  });

  it('commits end silently when work is followed by home (work->home rule)', () => {
    const r = infer([workEnter(9), workExit(16), homeEnter(16, 20)], at(16, 25));
    expect(r.endedAt).toBe(at(16));
    expect(r.confirmEnd).toBe(false);
  });

  it('re-entering any work cancels the pending end (stepped out / office switch)', () => {
    // leave office A, arrive office B 20 min later — still working, no end
    const r = infer([workEnter(9, 0, 1), workExit(12, 0, 1), workEnter(12, 20, 2)], at(13));
    expect(r.endedAt).toBeNull();
  });

  it('commits + asks when away > 1h with no home and no work re-entry', () => {
    const r = infer([workEnter(9), workExit(14)], at(15, 1)); // 61 min later
    expect(r.endedAt).toBe(at(14));
    expect(r.confirmEnd).toBe(true);
  });

  it('does not commit an off-time exit before the 1h threshold', () => {
    const r = infer([workEnter(9), workExit(14)], at(14, 30));
    expect(r.endedAt).toBeNull();
  });

  it('never proposes an end when one is already set', () => {
    const r = infer([workEnter(9), workExit(16), homeEnter(16, 10)], at(16, 20), {endedAtSet: true});
    expect(r.endedAt).toBeNull();
  });

  it('uses the LAST work departure as the end on an in/out day', () => {
    // out for a work errand (returns), then final departure -> home
    const r = infer(
      [workEnter(9), workExit(11), workEnter(11, 30), workExit(16), homeEnter(16, 15)],
      at(16, 20),
    );
    expect(r.endedAt).toBe(at(16));
  });

  it('empty day (no work) proposes nothing', () => {
    const r = infer([homeEnter(8)], at(20));
    expect(r.startedAt).toBeNull();
    expect(r.endedAt).toBeNull();
  });
});
