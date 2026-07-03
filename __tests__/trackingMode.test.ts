import {
  isMoving,
  nextTrackingMode,
  isDuplicateFix,
  MIN_FIX_GAP_MS,
  STATIONARY_STREAK_TO_SLOW,
  fastIntervalForSpeed,
  dedupGapMs,
  STREAK_TO_PARK,
  SPRINT_INTERVAL_MS,
  FAST_INTERVAL_MS,
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

describe('nextTrackingMode – parked', () => {
  it('parks when still long enough inside a saved fence (canPark)', () => {
    expect(nextTrackingMode('slow', false, STREAK_TO_PARK, true)).toBe('parked');
  });

  it('does not park without canPark (bg tracking off / outside fences)', () => {
    expect(nextTrackingMode('slow', false, STREAK_TO_PARK, false)).toBe('slow');
  });

  it('does not park before the park streak even inside a fence', () => {
    expect(nextTrackingMode('slow', false, STREAK_TO_PARK - 1, true)).toBe('slow');
  });

  it('wakes straight to fast from parked on movement', () => {
    expect(nextTrackingMode('parked', true, 0, true)).toBe('fast');
  });

  it('stays parked while still inside the fence', () => {
    expect(nextTrackingMode('parked', false, STREAK_TO_PARK + 5, true)).toBe('parked');
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

describe('fastIntervalForSpeed', () => {
  it('uses the sprint interval at scooter speed', () => {
    expect(fastIntervalForSpeed(7)).toBe(SPRINT_INTERVAL_MS); // 25 km/h
  });

  it('uses the normal fast interval at walking speed', () => {
    expect(fastIntervalForSpeed(1.4)).toBe(FAST_INTERVAL_MS);
  });

  it('uses the normal fast interval when speed is unknown', () => {
    expect(fastIntervalForSpeed(null)).toBe(FAST_INTERVAL_MS);
  });

  it('sprints exactly at the threshold', () => {
    expect(fastIntervalForSpeed(3.0)).toBe(SPRINT_INTERVAL_MS);
  });
});

describe('dedupGapMs', () => {
  it('is half the interval when that is under the cap (sprint)', () => {
    expect(dedupGapMs(2000)).toBe(1000);
  });

  it('caps at MIN_FIX_GAP_MS for slow intervals', () => {
    expect(dedupGapMs(60_000)).toBe(MIN_FIX_GAP_MS);
  });

  it('equals the cap at the normal fast interval (unchanged behavior)', () => {
    expect(dedupGapMs(4000)).toBe(2000);
  });
});
