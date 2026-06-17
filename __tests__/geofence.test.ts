import {clampRadius, MIN_RADIUS_M} from '../src/utils/geofence';

describe('clampRadius', () => {
  it('enforces the 50 m floor', () => {
    expect(clampRadius(0)).toBe(MIN_RADIUS_M);
    expect(clampRadius(25)).toBe(MIN_RADIUS_M);
    expect(clampRadius(49)).toBe(MIN_RADIUS_M);
  });

  it('leaves valid radii unchanged', () => {
    expect(clampRadius(50)).toBe(50);
    expect(clampRadius(150)).toBe(150);
    expect(clampRadius(1000)).toBe(1000);
  });

  it('rounds to whole metres', () => {
    expect(clampRadius(150.6)).toBe(151);
    expect(clampRadius(75.2)).toBe(75);
  });
});
