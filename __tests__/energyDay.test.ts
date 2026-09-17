import {bmrMifflin, missingProfileFields, energyDay, exerciseMet, type EnergyDayInput} from '../src/utils/energyDay';

const still = {footSec: 0, footM: 0, cycleSec: 0, cycleM: 0, vehicleSec: 0};
const base: EnergyDayInput = {
  bmr: 1800, minutesInDay: 1440, sleepMinutes: 480, exercise: [], movement: still,
  steps: null, workMinutes: 0, workActivity: 'desk',
};
const bucket = (d: ReturnType<typeof energyDay>, key: string) => d.buckets.find(b => b.key === key);

describe('bmrMifflin', () => {
  it('matches the published equation for both sexes', () => {
    // 10×80 + 6.25×180 − 5×40 + 5
    expect(bmrMifflin({weightKg: 80, heightCm: 180, birthYear: 1986, sex: 'male'}, 2026)).toBe(1730);
    expect(bmrMifflin({weightKg: 65, heightCm: 165, birthYear: 1996, sex: 'female'}, 2026)).toBe(1370);
  });

  it('is null, with the gaps named, until the profile is complete', () => {
    const p = {weightKg: 80, heightCm: null, birthYear: 1986, sex: null};
    expect(bmrMifflin(p, 2026)).toBeNull();
    expect(missingProfileFields(p)).toEqual(['height', 'sex']);
  });
});

describe('energyDay', () => {
  it('a day of only sleep and rest: 8 h × 1.0 + 16 h × 1.4', () => {
    const d = energyDay(base);
    expect(d.buckets.map(b => b.key)).toEqual(['sleep', 'rest']);
    expect(d.buckets.reduce((s, b) => s + b.minutes, 0)).toBe(1440);
    // 1800 × (8 + 16×1.4) / 24 = 2280
    expect(d.totalKcal).toBe(2280);
    expect(d.pal).toBeCloseTo(1.27, 2);
  });

  it('assumes 8 h of sleep when Health Connect has none, and says so', () => {
    expect(bucket(energyDay({...base, sleepMinutes: null}), 'sleep')).toMatchObject({minutes: 480, assumed: true});
  });

  it('adds work, vehicle, exercise and GPS walking at their own ratios', () => {
    const d = energyDay({
      ...base,
      workMinutes: 450, workActivity: 'mixed',
      exercise: [{type: 70, minutes: 60}],
      movement: {...still, footSec: 3600, footM: 5000, vehicleSec: 1800},
    });
    expect(bucket(d, 'work')).toMatchObject({minutes: 450, par: 2.2});
    expect(bucket(d, 'exercise')).toMatchObject({minutes: 60, par: exerciseMet(70)});
    expect(bucket(d, 'walk')).toMatchObject({minutes: 60, par: 3.8}); // 5 km/h band
    expect(bucket(d, 'vehicle')).toMatchObject({minutes: 30, par: 1.5});
    expect(d.buckets.reduce((s, b) => s + b.minutes, 0)).toBe(1440);
    expect(d.totalKcal).toBeGreaterThan(2280);
  });

  it('counts a walk once when both the watch and the GPS trail saw it', () => {
    const gpsOnly = energyDay({...base, movement: {...still, footSec: 3600, footM: 5000}});
    const both = energyDay({...base, movement: {...still, footSec: 3600, footM: 5000}, exercise: [{type: 79, minutes: 55}]});
    expect(both.totalKcal).toBe(gpsOnly.totalKcal);
    // a run the GPS trail classed as a slow walk: the session wins
    const run = energyDay({...base, movement: {...still, footSec: 1800, footM: 2000}, exercise: [{type: 56, minutes: 40}]});
    expect(bucket(run, 'walk')).toMatchObject({minutes: 40, par: 9});
  });

  it('turns only the steps walking does not explain into extra minutes', () => {
    // 3 km of GPS walking explains 4000 steps; 3000 left → 30 min
    const d = energyDay({...base, steps: 7000, movement: {...still, footSec: 2400, footM: 3000}});
    expect(bucket(d, 'steps')).toMatchObject({minutes: 30, par: 2.5});
    expect(bucket(energyDay({...base, steps: 3000, movement: {...still, footSec: 2400, footM: 3000}}), 'steps')).toBeUndefined();
  });

  it('never exceeds the day: later buckets are trimmed, today covers elapsed minutes only', () => {
    const d = energyDay({...base, sleepMinutes: 600, workMinutes: 1000});
    expect(bucket(d, 'work')?.minutes).toBe(840);
    expect(bucket(d, 'rest')).toBeUndefined();
    const morning = energyDay({...base, minutesInDay: 600, sleepMinutes: 420});
    expect(morning.buckets.reduce((s, b) => s + b.minutes, 0)).toBe(600);
  });
});
