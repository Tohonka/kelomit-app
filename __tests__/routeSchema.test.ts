import {migrations} from '../src/db/migrations';

describe('route schema migration', () => {
  const migration = migrations.find(item => item.version === 20);
  const up = migration?.up.join('\n') ?? '';

  it('creates the route history tables and place candidates cache', () => {
    expect(up).toContain('CREATE TABLE IF NOT EXISTS named_places');
    expect(up).toContain('CREATE TABLE IF NOT EXISTS day_route_stops');
    expect(up).toContain('CREATE TABLE IF NOT EXISTS day_route_segments');
    expect(up).toContain('ALTER TABLE place_cache ADD COLUMN candidates_json TEXT');
  });

  it('keeps historical route rows when named places are removed', () => {
    expect(up).toContain('day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE');
    expect(up).toContain('named_place_id INTEGER REFERENCES named_places(id) ON DELETE SET NULL');
  });

  it('indexes route lookups by day, time, sequence, and foreign key', () => {
    expect(up).toContain('idx_route_stops_day_time ON day_route_stops(day_id, start_ts)');
    expect(up).toContain('idx_route_segments_day_sequence ON day_route_segments(day_id, sequence)');
    expect(up).toContain('idx_route_stops_saved ON day_route_stops(saved_location_id)');
    expect(up).toContain('idx_route_stops_named ON day_route_stops(named_place_id)');
    expect(up).toContain('idx_route_segments_origin ON day_route_segments(origin_stop_id)');
    expect(up).toContain('idx_route_segments_destination ON day_route_segments(destination_stop_id)');
  });
});
