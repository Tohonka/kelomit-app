import {isDuplicateCrossing} from '../src/services/crossingStore';

describe('isDuplicateCrossing', () => {
  it('is not a duplicate when there is no prior event', () => {
    expect(isDuplicateCrossing(null, 1000)).toBe(false);
  });
  it('flags a same-key event inside the 60s window as duplicate', () => {
    expect(isDuplicateCrossing(1000, 1000 + 30_000)).toBe(true);
  });
  it('accepts a same-key event after the window', () => {
    expect(isDuplicateCrossing(1000, 1000 + 61_000)).toBe(false);
  });
  it('treats exactly the window boundary as not duplicate', () => {
    expect(isDuplicateCrossing(1000, 1000 + 60_000)).toBe(false);
  });
});
