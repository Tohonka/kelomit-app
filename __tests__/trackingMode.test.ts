import {
  isMoving,
  nextTrackingMode,
  isDuplicateFix,
  MIN_FIX_GAP_MS,
  STATIONARY_STREAK_TO_SLOW,
} from '../src/services/trackingMode';

describe('isMoving', () => {
  it('uses speed when present (moving)', () => {
    expect(isMoving(2.0, 0, 1000)).toBe(true);
  });

  it('uses speed when present and ignores displacement (still)', () => {
    // speed says still even though displacement is large → still
    expect(isMoving(0.2, 9999, 1000)).toBe(false);
  });

  it('falls back to displacement/elapsed when speed is null (moving)', () => {
    expect(isMoving(null, 30, 10_000)).toBe(true); // 3 m/s
  });

  it('falls back to displacement/elapsed when speed is null (still)', () => {
    expect(isMoving(null, 2, 10_000)).toBe(false); // 0.2 m/s
  });

  it('is not moving on the first fix (no speed, zero elapsed)', () => {
    expect(isMoving(null, 0, 0)).toBe(false);
  });

  it('treats exactly-zero speed as still', () => {
    expect(isMoving(0.0, 9999, 1000)).toBe(false);
  });
});

describe('nextTrackingMode', () => {
  it('tightens to fast immediately on movement', () => {
    expect(nextTrackingMode('slow', true, 99)).toBe('fast');
  });

  it('stays in the previous mode while still but under the streak threshold', () => {
    expect(nextTrackingMode('fast', false, STATIONARY_STREAK_TO_SLOW - 1)).toBe('fast');
  });

  it('relaxes to slow once the still streak is reached', () => {
    expect(nextTrackingMode('fast', false, STATIONARY_STREAK_TO_SLOW)).toBe('slow');
  });

  it('stays slow while still and under the threshold', () => {
    expect(nextTrackingMode('slow', false, 1)).toBe('slow');
  });
});

describe('isDuplicateFix', () => {
  it('is not a duplicate when there is no prior accepted fix', () => {
    expect(isDuplicateFix(10_000, 0)).toBe(false);
  });

  it('flags a fix arriving within the gap as a duplicate', () => {
    expect(isDuplicateFix(10_500, 10_000)).toBe(true); // 500ms < 2000ms
  });

  it('accepts a fix arriving after the gap', () => {
    expect(isDuplicateFix(14_000, 10_000)).toBe(false); // 4000ms >= 2000ms
  });

  it('treats a fix exactly at the gap boundary as not a duplicate', () => {
    expect(isDuplicateFix(10_000 + MIN_FIX_GAP_MS, 10_000)).toBe(false);
  });
});
