import {clampRadius, radiusStep, MIN_RADIUS_M} from '../src/utils/geofence';

describe('clampRadius', () => {
  it('enforces the 14 m floor', () => {
    expect(MIN_RADIUS_M).toBe(14);
    expect(clampRadius(0)).toBe(MIN_RADIUS_M);
    expect(clampRadius(10)).toBe(MIN_RADIUS_M);
    expect(clampRadius(13)).toBe(MIN_RADIUS_M);
  });

  it('leaves valid radii unchanged', () => {
    expect(clampRadius(14)).toBe(14);
    expect(clampRadius(25)).toBe(25);
    expect(clampRadius(150)).toBe(150);
    expect(clampRadius(1000)).toBe(1000);
  });

  it('rounds to whole metres', () => {
    expect(clampRadius(150.6)).toBe(151);
    expect(clampRadius(75.2)).toBe(75);
  });
});

describe('radiusStep', () => {
  it('is fine (2 m) at/below 30 m and coarse (25 m) above', () => {
    expect(radiusStep(14)).toBe(2);
    expect(radiusStep(30)).toBe(2);
    expect(radiusStep(31)).toBe(25);
    expect(radiusStep(150)).toBe(25);
  });
});
