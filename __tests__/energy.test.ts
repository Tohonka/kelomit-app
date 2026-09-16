import {metFor, movementKcal} from '../src/utils/energy';

describe('metFor', () => {
  it('bands walking and cycling by speed', () => {
    expect(metFor('foot', 2)).toBe(2.3);
    expect(metFor('foot', 5)).toBe(3.8);
    expect(metFor('foot', 6)).toBe(4.8);
    expect(metFor('foot', 9)).toBe(8.0);
    expect(metFor('cycle', 12)).toBe(4.0);
    expect(metFor('cycle', 20)).toBe(8.0);
    expect(metFor('cycle', 30)).toBe(10.0);
  });
});

describe('movementKcal', () => {
  it('sums walking and cycling by MET × kg × h and rounds to 50', () => {
    // 1 h walking at 5 km/h (MET 3.8) + 30 min cycling at 18 km/h (MET 6.8), 80 kg:
    // 3.8×80×1 + 6.8×80×0.5 = 304 + 272 = 576 → 600
    expect(movementKcal({footSec: 3600, footM: 5000, cycleSec: 1800, cycleM: 9000}, 80)).toBe(600);
    expect(movementKcal({footSec: 0, footM: 0, cycleSec: 0, cycleM: 0}, 80)).toBe(0);
  });
});
