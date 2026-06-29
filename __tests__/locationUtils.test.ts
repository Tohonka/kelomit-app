import {isStationaryJitter, type RecordedPoint} from '../src/services/locationUtils';

const at = (latitude: number, longitude: number, accuracy: number | null = 10): RecordedPoint => ({
  latitude,
  longitude,
  accuracy,
});

describe('isStationaryJitter', () => {
  it('rejects small drift while reported stationary', () => {
    // ~5 m north, speed ~0 → jitter
    expect(isStationaryJitter(at(60.17, 24.94), 60.170045, 24.94, 10, 0)).toBe(true);
  });

  it('keeps a point when the device reports real movement', () => {
    // small move but speed says walking → record
    expect(isStationaryJitter(at(60.17, 24.94), 60.170045, 24.94, 10, 1.4)).toBe(false);
  });

  it('keeps a large move even when speed is unknown', () => {
    // ~50 m north, speed null → beyond noise, record
    expect(isStationaryJitter(at(60.17, 24.94), 60.17045, 24.94, 10, null)).toBe(false);
  });

  it('rejects small drift when speed is unknown (uses accuracy floor)', () => {
    // ~5 m, accuracy null → noise floor 8 m, 8*1.5=12 m, 5 < 12 → jitter
    expect(isStationaryJitter(at(60.17, 24.94, null), 60.170045, 24.94, null, null)).toBe(true);
  });
});
