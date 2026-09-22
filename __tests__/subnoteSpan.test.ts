import {checkSubnoteSpan, parentLengthSec} from '../src/utils/subnoteSpan';

const P = {duration_sec: null, time_from: '2026-09-22T09:00:00.000Z', time_to: '2026-09-22T11:00:00.000Z'};

describe('checkSubnoteSpan', () => {
  it('is empty when the subnote sits inside the parent', () => {
    expect(checkSubnoteSpan(P, '2026-09-22T09:30:00.000Z', '2026-09-22T10:00:00.000Z', null)).toEqual({});
  });
  it('proposes moving the parent start when the subnote starts earlier', () => {
    expect(checkSubnoteSpan(P, '2026-09-22T08:30:00.000Z', '2026-09-22T10:00:00.000Z', null))
      .toEqual({moveParentFrom: '2026-09-22T08:30:00.000Z'});
  });
  it('proposes moving the parent end when the subnote ends later', () => {
    expect(checkSubnoteSpan(P, '2026-09-22T10:00:00.000Z', '2026-09-22T12:00:00.000Z', null))
      .toEqual({moveParentTo: '2026-09-22T12:00:00.000Z'});
  });
  it('lets a subnote run past a parent that has no end yet', () => {
    const open = {...P, time_to: null};
    expect(checkSubnoteSpan(open, '2026-09-22T10:00:00.000Z', '2026-09-22T13:00:00.000Z', null)).toEqual({});
  });
  it('caps a duration subnote at the parent length', () => {
    expect(checkSubnoteSpan(P, '2026-09-22T09:00:00.000Z', null, 3 * 3600)).toEqual({tooLong: 7200});
    expect(checkSubnoteSpan(P, '2026-09-22T09:00:00.000Z', null, 3600)).toEqual({});
  });
  it('never moves a duration-type parent, but still caps length', () => {
    const dur = {duration_sec: 1800, time_from: '2026-09-22T09:00:00.000Z', time_to: '2026-09-22T09:30:00.000Z'};
    expect(checkSubnoteSpan(dur, '2026-09-22T08:00:00.000Z', '2026-09-22T10:00:00.000Z', null)).toEqual({});
    expect(checkSubnoteSpan(dur, null, null, 3600)).toEqual({tooLong: 1800});
  });
  it('parentLengthSec is null for an open parent', () => {
    expect(parentLengthSec({...P, time_to: null})).toBeNull();
  });
});
