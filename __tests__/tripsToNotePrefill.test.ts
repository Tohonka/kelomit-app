import {tripsToNotePrefill} from '../src/components/map/TripList';
import type {DayRouteSegment, DayRouteStop} from '../src/types';

jest.mock('@react-navigation/native', () => ({useFocusEffect: jest.fn()}));
jest.mock('react-native-maps', () => ({
  __esModule: true,
  default: () => null,
  Marker: () => null,
  Polyline: () => null,
  PROVIDER_GOOGLE: 'google',
}));

const LABELS = {dayStart: 'Day start', dayEnd: 'Day end', unknown: 'Unknown'};

function segment(overrides: Partial<DayRouteSegment>): DayRouteSegment {
  return {
    id: 1,
    day_id: 1,
    sequence: 0,
    start_ts: '2026-08-20T08:00:00.000Z',
    end_ts: '2026-08-20T08:30:00.000Z',
    origin_stop_id: null,
    destination_stop_id: null,
    coordinates: [],
    distance_m: 5000,
    duration_sec: 1800,
    average_speed_mps: 0,
    maximum_speed_mps: 0,
    raw_last_ts: '',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function stop(id: number, name: string): [number, DayRouteStop] {
  return [id, {display_name: name} as DayRouteStop];
}

test('multiple trips: one line each, times span first start to last end', () => {
  const segments = [
    segment({id: 1, destination_stop_id: 10}),
    segment({
      id: 2,
      origin_stop_id: 10,
      start_ts: '2026-08-20T10:00:00.000Z',
      end_ts: '2026-08-20T10:45:00.000Z',
      distance_m: 12300,
      duration_sec: 2700,
    }),
  ];
  const prefill = tripsToNotePrefill(
    segments,
    new Map([stop(10, 'Office')]),
    LABELS,
  );
  const lines = prefill.body.split('\n');
  expect(lines).toHaveLength(2);
  expect(lines[0]).toMatch(/^Day start → Office, /);
  expect(lines[0]).toContain('5.0 km');
  expect(lines[1]).toMatch(/^Office → Day end, /);
  expect(lines[1]).toContain('12.3 km');
  expect(prefill.timeFrom).toBe('2026-08-20T08:00:00.000Z');
  expect(prefill.timeTo).toBe('2026-08-20T10:45:00.000Z');
});
