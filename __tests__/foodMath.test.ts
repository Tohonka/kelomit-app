import {rankRecents, scaleKcal, kcalFor, defaultPortion, fineliToProduct, portionOptions, portionKcal} from '../src/utils/foodMath';
import type {FoodEntry} from '../src/types';

const at = (id: number, name: string, localHHMM: string, daysAgo = 0, kcal: number | null = 100): FoodEntry => {
  const d = new Date(2026, 8, 15 - daysAgo, Number(localHHMM.slice(0, 2)), Number(localHHMM.slice(3)));
  return {
    id, day_id: 1, eaten_at: d.toISOString(), name, kcal, product_id: null, quantity: null, unit: null,
    note: null, file_path: null, thumbnail_path: null, latitude: null, longitude: null,
    location_label: null, created_at: '', updated_at: '',
  };
};

describe('rankRecents', () => {
  it('prefers items eaten near this time of day, then frequency, then recency', () => {
    const entries = [
      at(1, 'Puuro', '08:00', 1), at(2, 'Puuro', '08:10', 2), at(3, 'Puuro', '07:50', 3),
      at(4, 'Kahvi', '08:05', 1), at(5, 'Kahvi', '14:00', 1), at(6, 'Kahvi', '14:05', 2), at(7, 'Kahvi', '20:00', 2),
      at(8, 'Iltapala', '21:30', 1),
    ];
    const morning = rankRecents(entries, 8 * 60);
    expect(morning.map(r => r.name)).toEqual(['Puuro', 'Kahvi', 'Iltapala']);
    const evening = rankRecents(entries, 22 * 60);
    expect(evening.map(r => r.name)).toEqual(['Iltapala', 'Kahvi', 'Puuro']);
  });

  it('dedupes case-insensitively, keeps the most recent as the template, respects the limit', () => {
    const entries = [at(1, 'kahvi', '09:00', 2, 5), at(2, 'Kahvi', '09:00', 1, 10), at(3, 'Tee', '09:00', 1)];
    const r = rankRecents(entries, 9 * 60, 1);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({name: 'Kahvi', kcal: 10});
  });

  it('wraps around midnight', () => {
    const entries = [at(1, 'Yöpala', '23:50', 1), at(2, 'Lounas', '12:00', 1), at(3, 'Lounas', '12:05', 2)];
    expect(rankRecents(entries, 10)[0].name).toBe('Yöpala');
  });
});

describe('scaleKcal', () => {
  it('rounds and passes null through', () => {
    expect(scaleKcal(333, 0.5)).toBe(167);
    expect(scaleKcal(null, 2)).toBeNull();
  });
});

describe('kcalFor / defaultPortion', () => {
  const oltermanni = {kcal_per_100: 272, kcal_per_serving: 27.2, serving_g: 10};
  const bread = {kcal_per_100: 240, kcal_per_serving: null, serving_g: 30};
  const userFood = {kcal_per_100: null, kcal_per_serving: 350, serving_g: null};
  const unknown = {kcal_per_100: null, kcal_per_serving: null, serving_g: null};

  it('scales per 100 g and per serving, deriving a serving from grams when needed', () => {
    expect(kcalFor(oltermanni, 30, 'g')).toBe(82);
    expect(kcalFor(oltermanni, 2, 'serving')).toBe(54);
    expect(kcalFor(bread, 2, 'serving')).toBe(144);
    expect(kcalFor(userFood, 1, 'serving')).toBe(350);
    expect(kcalFor(userFood, 100, 'g')).toBeNull();
    expect(kcalFor(unknown, 1, 'serving')).toBeNull();
  });

  it('defaults to one serving when known, else 100 g', () => {
    expect(defaultPortion(oltermanni)).toEqual({quantity: 1, unit: 'serving'});
    expect(defaultPortion(userFood)).toEqual({quantity: 1, unit: 'serving'});
    expect(defaultPortion({kcal_per_100: 50, kcal_per_serving: null, serving_g: null})).toEqual({quantity: 100, unit: 'g'});
  });
});

describe('fineliToProduct', () => {
  const food = {id: 1009, name_fi: 'Ruisleipä', name_en: 'Rye bread', name_sv: null, kcal_per_100: 239.5, protein_per_100: 7.3, carbs_per_100: 43.7, fat_per_100: 1.4};
  const labels = {KPL_M: ['keskikokoinen (kpl)', 'medium-sized piece'] as [string, string]};

  it('uses the first household unit as the serving and names in the UI language', () => {
    const p = fineliToProduct(food, [{code: 'KPL_M', grams: 35}, {code: 'PORTM', grams: 35}], labels, 'en');
    expect(p).toMatchObject({name: 'Rye bread', source: 'fineli', source_ref: '1009', kcal_per_100: 239.5, serving_g: 35, serving_label: 'medium-sized piece', kcal_per_serving: 84, barcode: null});
    expect(fineliToProduct(food, [], labels, 'fi')).toMatchObject({name: 'Ruisleipä', serving_g: null, serving_label: null, kcal_per_serving: null});
  });
});

describe('portionOptions / portionKcal', () => {
  const labels = {DL: ['desilitra', 'decilitre'] as [string, string], KPL_M: ['keskikokoinen (kpl)', 'medium-sized piece'] as [string, string]};
  const candy = {source: 'off' as const, kcal_per_100: 400, kcal_per_serving: null, serving_g: null, serving_label: null};
  const cheese = {source: 'off' as const, kcal_per_100: 272, kcal_per_serving: 27.2, serving_g: 10, serving_label: '10 g'};
  const userFood = {source: 'user' as const, kcal_per_100: null, kcal_per_serving: 350, serving_g: null, serving_label: null};
  const fineli = {source: 'fineli' as const, kcal_per_100: 239.5, kcal_per_serving: 84, serving_g: 35, serving_label: 'keskikokoinen (kpl)'};

  it('always offers grams; adds the serving or the Fineli units', () => {
    expect(portionOptions(candy, [], labels, 'fi', 'annos').map(o => o.key)).toEqual(['g']);
    expect(portionOptions(cheese, [], labels, 'en', 'serving').map(o => o.label)).toEqual(['g', '10 g']);
    expect(portionOptions(userFood, [], labels, 'en', 'serving')[1]).toMatchObject({key: 'serving', label: 'serving', grams: null, kcalPerUnit: 350});
    const f = portionOptions(fineli, [{code: 'KPL_M', grams: 35}, {code: 'DL', grams: 100}], labels, 'en', 'serving');
    expect(f.map(o => o.label)).toEqual(['g', 'medium-sized piece · 35 g', 'decilitre · 100 g']);
  });

  it('computes kcal by mass first, else per unit, else null', () => {
    const [g] = portionOptions(candy, [], labels, 'fi', 'annos');
    expect(portionKcal(400, g, 20)).toBe(80);
    const serving = portionOptions(userFood, [], labels, 'en', 'serving')[1];
    expect(portionKcal(null, serving, 2)).toBe(700);
    expect(portionKcal(null, g, 20)).toBeNull();
  });
});
