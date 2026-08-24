import {clampRadius, MIN_RADIUS_M, MAX_RADIUS_M} from '../src/utils/geofence';

describe('clampRadius', () => {
  it('enforces the 6 m floor', () => {
    expect(MIN_RADIUS_M).toBe(6);
    expect(clampRadius(0)).toBe(MIN_RADIUS_M);
    expect(clampRadius(3)).toBe(6);
    expect(clampRadius(5)).toBe(MIN_RADIUS_M);
  });

  it('enforces the 2000 m ceiling', () => {
    expect(MAX_RADIUS_M).toBe(2000);
    expect(clampRadius(2001)).toBe(MAX_RADIUS_M);
    expect(clampRadius(99999)).toBe(2000);
  });

  it('leaves valid radii unchanged', () => {
    expect(clampRadius(6)).toBe(6);
    expect(clampRadius(25)).toBe(25);
    expect(clampRadius(150)).toBe(150);
    expect(clampRadius(2000)).toBe(2000);
  });

  it('rounds to whole metres', () => {
    expect(clampRadius(150.6)).toBe(151);
    expect(clampRadius(150.4)).toBe(150);
    expect(clampRadius(75.2)).toBe(75);
  });
});
