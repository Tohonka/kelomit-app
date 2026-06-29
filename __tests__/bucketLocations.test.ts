import {bucketLocations} from '../src/utils/bucketLocations';
import type {Entry} from '../src/types';

const e = (id: number, latitude: number | null, longitude: number | null): Entry =>
  ({
    id,
    day_id: 1,
    entry_type: 'photo',
    activity_type: 'work',
    project_id: null,
    title: null,
    body: null,
    file_path: null,
    thumbnail_path: null,
    duration_sec: null,
    time_from: null,
    time_to: null,
    latitude,
    longitude,
    location_label: null,
    is_todo: false,
    scheduled_date: null,
    completed_at: null,
    reminder_at: null,
    created_at: '',
    updated_at: '',
  } as Entry);

// ~0.0003 deg latitude ≈ 33 m; ~0.001 deg ≈ 111 m.
describe('bucketLocations', () => {
  it('returns nothing for no entries', () => {
    expect(bucketLocations([])).toEqual([]);
  });

  it('skips entries missing coordinates', () => {
    expect(bucketLocations([e(1, null, null), e(2, 60.17, null)])).toEqual([]);
  });

  it('merges two points within 50 m into one bucket', () => {
    const out = bucketLocations([e(1, 60.1700, 24.9400), e(2, 60.1702, 24.9400)], 50);
    expect(out).toHaveLength(1);
    expect(out[0].entries.map(x => x.id)).toEqual([1, 2]);
  });

  it('keeps points more than 50 m apart in separate buckets', () => {
    const out = bucketLocations([e(1, 60.1700, 24.9400), e(2, 60.1720, 24.9400)], 50);
    expect(out).toHaveLength(2);
  });

  it('anchors the bucket at the first entry and preserves input order', () => {
    const out = bucketLocations(
      [e(1, 60.1700, 24.9400), e(2, 60.1750, 24.9400), e(3, 60.1701, 24.9400)],
      50,
    );
    expect(out).toHaveLength(2);
    expect(out[0].latitude).toBe(60.17);
    expect(out[0].entries.map(x => x.id)).toEqual([1, 3]);
    expect(out[1].entries.map(x => x.id)).toEqual([2]);
  });
});
