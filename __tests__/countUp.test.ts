import {countUpValue} from '../src/utils/countUp';

describe('countUpValue', () => {
  it('is 0 at progress 0', () => {
    expect(countUpValue(0, 480)).toBe(0);
  });
  it('is the target at progress 1', () => {
    expect(countUpValue(1, 480)).toBe(480);
  });
  it('rounds at the midpoint', () => {
    expect(countUpValue(0.5, 480)).toBe(240);
    expect(countUpValue(0.5, 481)).toBe(241); // round, not floor
  });
  it('clamps out-of-range progress', () => {
    expect(countUpValue(-0.3, 480)).toBe(0);
    expect(countUpValue(1.4, 480)).toBe(480);
  });
});
