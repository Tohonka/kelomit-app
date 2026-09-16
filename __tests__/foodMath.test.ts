import {rankRecents, scaleKcal} from '../src/utils/foodMath';
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
