import {
  isMoving,
  nextTrackingMode,
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
