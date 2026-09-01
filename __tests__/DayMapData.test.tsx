import React from 'react';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';

const mockGetDayRouteHistory = jest.fn();
const mockGetEntriesForDay = jest.fn();
const mockRefreshRouteDayIfStale = jest.fn();
let mockFocusCallback: (() => void | (() => void)) | null = null;

jest.mock('react-native-maps', () => {
  const {View} = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: View,
    Marker: View,
    Polyline: View,
    PROVIDER_GOOGLE: 'google',
  };
});
jest.mock('@react-navigation/native', () => {
  const ReactModule = jest.requireActual('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      ReactModule.useEffect(() => {
        mockFocusCallback = callback;
        return callback();
      }, [callback]);
    },
  };
});
jest.mock('react-i18next', () => ({
  initReactI18next: {type: '3rdParty', init: jest.fn()},
  useTranslation: () => ({t: (key: string) => key}),
}));
jest.mock('../src/theme', () => {
  const actual = jest.requireActual('../src/theme');
  const {lightColors} = jest.requireActual('../src/theme/colors');
  return {...actual, useTheme: () => ({colors: lightColors, isDark: false})};
});
jest.mock('../src/db/routeHistory', () => ({
  getDayRouteHistory: (...args: unknown[]) =>
    mockGetDayRouteHistory(...args),
}));
jest.mock('../src/db/entries', () => ({
  getEntriesForDay: (...args: unknown[]) => mockGetEntriesForDay(...args),
  createEntry: jest.fn(),
  updateEntry: jest.fn(),
  deleteEntry: jest.fn(),
  setTodoCompleted: jest.fn(),
}));
jest.mock('../src/services/routeHistoryService', () => ({
  refreshRouteDayIfStale: (...args: unknown[]) =>
    mockRefreshRouteDayIfStale(...args),
}));

import {Polyline} from 'react-native-maps';
import {
  useDayMapData,
  DayMapCanvas,
  type DayMapData,
} from '../src/screens/DayMapScreen';
import {useEntryStore} from '../src/store/entryStore';
import type {DayRouteSegment, Entry} from '../src/types';

const routeSegment: DayRouteSegment = {
  id: 20,
  day_id: 4,
  sequence: 0,
  start_ts: '2026-07-24T08:00:00.000Z',
  end_ts: '2026-07-24T08:30:00.000Z',
  origin_stop_id: null,
  destination_stop_id: null,
  coordinates: [
    {latitude: 60, longitude: 24},
    {latitude: 60.01, longitude: 24.01},
  ],
  distance_m: 1000,
  duration_sec: 1800,
  average_speed_mps: 0.56,
  maximum_speed_mps: 1,
  raw_last_ts: '2026-07-24T08:30:00.000Z',
  mode_spans: null,
  still_seconds: null,
  via: null,
  created_at: '2026-07-24T08:30:00.000Z',
  updated_at: '2026-07-24T08:30:00.000Z',
};

const entry = (id: number, latitude: number, longitude: number): Entry => ({
  id,
  day_id: 4,
  entry_type: 'note',
  activity_type: 'work',
  project_id: null,
  parent_id: null,
  tally: null,
  title: `Note ${id}`,
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
  is_overtime: false,
  scheduled_date: null,
  completed_at: null,
  reminder_at: null,
  created_at: '2026-07-24T08:00:00.000Z',
  updated_at: '2026-07-24T08:00:00.000Z',
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return {promise, resolve};
}

let latest!: DayMapData;

function Harness() {
  latest = useDayMapData(4);
  return null;
}

async function renderHarness(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<Harness />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocusCallback = null;
  mockRefreshRouteDayIfStale.mockResolvedValue(false);
  useEntryStore.setState({
    entriesByDay: {},
    isLoading: false,
    error: null,
  });
});

it('waits for late entries before exposing ready map data and includes their bounds', async () => {
  const lateEntries = deferred<Entry[]>();
  mockGetDayRouteHistory.mockResolvedValue({
    stops: [],
    segments: [routeSegment],
  });
  mockGetEntriesForDay.mockReturnValue(lateEntries.promise);

  const renderer = await renderHarness();

  expect(latest.isReady).toBe(false);
  expect(latest.segments).toEqual([]);
  expect(latest.region).toBeUndefined();

  await act(async () => {
    lateEntries.resolve([entry(1, 61, 25)]);
    await lateEntries.promise;
    await Promise.resolve();
  });

  expect(latest.isReady).toBe(true);
  expect(latest.buckets).toHaveLength(1);
  expect(latest.region).toEqual({
    latitude: 60.5,
    longitude: 24.5,
    latitudeDelta: 1.4,
    longitudeDelta: 1.4,
  });
  act(() => {
    renderer.unmount();
  });
});

it('renders accepted route history with empty entries when the entry read fails', async () => {
  const staleEntry = entry(9, 61, 25);
  useEntryStore.setState({entriesByDay: {4: [staleEntry]}});
  mockGetDayRouteHistory.mockResolvedValue({
    stops: [],
    segments: [routeSegment],
  });
  mockGetEntriesForDay.mockRejectedValue(new Error('entry read failed'));

  const renderer = await renderHarness();

  expect(latest.isReady).toBe(true);
  expect(latest.segments).toEqual([routeSegment]);
  expect(latest.buckets).toEqual([]);
  expect(latest.region?.latitude).toBeCloseTo(60.005);
  expect(latest.region?.longitude).toBeCloseTo(24.005);
  expect(latest.region?.latitudeDelta).toBeCloseTo(0.014);
  expect(latest.region?.longitudeDelta).toBeCloseTo(0.014);
  expect(latest.stats).toEqual({distanceM: 1000, durationSec: 1800});
  expect(useEntryStore.getState().entriesByDay[4]).toEqual([staleEntry]);
  act(() => {
    renderer.unmount();
  });
});

it('lets a correction reload invalidate older focus history and entries', async () => {
  const oldHistory = deferred<{
    stops: [];
    segments: DayRouteSegment[];
  }>();
  const oldEntries = deferred<Entry[]>();
  const initialEntry = entry(1, 60.2, 24.2);
  const correctionEntry = entry(2, 60.3, 24.3);
  const staleEntry = entry(3, 61, 25);
  const correctedSegment = {...routeSegment, id: 21, distance_m: 2000};
  const staleSegment = {...routeSegment, id: 22, distance_m: 3000};
  mockGetDayRouteHistory
    .mockResolvedValueOnce({stops: [], segments: [routeSegment]})
    .mockReturnValueOnce(oldHistory.promise)
    .mockResolvedValueOnce({stops: [], segments: [correctedSegment]});
  mockGetEntriesForDay
    .mockResolvedValueOnce([initialEntry])
    .mockReturnValueOnce(oldEntries.promise)
    .mockResolvedValueOnce([correctionEntry]);

  const renderer = await renderHarness();
  expect(latest.isReady).toBe(true);

  act(() => {
    mockFocusCallback?.();
  });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(mockGetDayRouteHistory).toHaveBeenCalledTimes(2);
  expect(mockGetEntriesForDay).toHaveBeenCalledTimes(2);
  await act(async () => {
    const correction = latest.reloadRouteHistory();
    await correction;
    oldHistory.resolve({stops: [], segments: [staleSegment]});
    oldEntries.resolve([staleEntry]);
    await Promise.all([oldHistory.promise, oldEntries.promise]);
    await Promise.resolve();
  });

  expect(latest.segments).toEqual([correctedSegment]);
  expect(useEntryStore.getState().entriesByDay[4]).toEqual([
    correctionEntry,
  ]);
  act(() => {
    renderer.unmount();
  });
});

// Polyline is mocked to the same View component as MapView/Marker, so
// distinguish by the props only Polyline sets.
function polylines(root: ReactTestInstance): ReactTestInstance[] {
  return root.findAll(
    node => node.type === Polyline && node.props.strokeColor !== undefined,
  );
}

function canvas(props: Partial<React.ComponentProps<typeof DayMapCanvas>>) {
  return (
    <DayMapCanvas
      segments={props.segments ?? []}
      routeCoords={[]}
      buckets={[]}
      region={undefined}
      onOpenEntry={jest.fn()}
      interactive={props.interactive}
      onPressSegment={props.onPressSegment}
    />
  );
}

const modeSegment: DayRouteSegment = {
  ...routeSegment,
  id: 30,
  coordinates: [
    {latitude: 60, longitude: 24, t: 1000},
    {latitude: 60.01, longitude: 24.01, t: 2000},
    {latitude: 60.02, longitude: 24.02, t: 3000},
  ],
  mode_spans: [
    {mode: 'vehicle', startTs: '1970-01-01T00:00:00.000Z', endTs: '1970-01-01T00:00:02.000Z'},
    {mode: 'foot', startTs: '1970-01-01T00:00:02.000Z', endTs: '1970-01-01T00:00:04.000Z'},
  ],
};

describe('DayMapCanvas mode-styled polylines', () => {
  it('renders one dashed and one solid polyline, same color, for a mode-spanned segment', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(canvas({segments: [modeSegment]}));
    });

    const lines = polylines(renderer.root);
    expect(lines).toHaveLength(2);
    const [vehicleLine, footLine] = lines;
    expect(vehicleLine.props.lineDashPattern).toBeUndefined();
    expect(footLine.props.lineDashPattern).toEqual([1, 12]);
    expect(footLine.props.strokeColor).toBe(vehicleLine.props.strokeColor);
  });

  it('renders exactly one solid polyline for a legacy segment with no mode_spans', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(canvas({segments: [routeSegment]}));
    });

    const lines = polylines(renderer.root);
    expect(lines).toHaveLength(1);
    expect(lines[0].props.lineDashPattern).toBeUndefined();
  });

  it('fires onPressSegment with the parent segment when a slice is tapped', () => {
    const onPressSegment = jest.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        canvas({segments: [modeSegment], interactive: true, onPressSegment}),
      );
    });

    const lines = polylines(renderer.root);
    expect(lines[0].props.tappable).toBe(true);
    act(() => {
      lines[1].props.onPress();
    });
    expect(onPressSegment).toHaveBeenCalledWith(modeSegment);
  });

  it('is not tappable when non-interactive even if onPressSegment is passed', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        canvas({segments: [routeSegment], interactive: false, onPressSegment: jest.fn()}),
      );
    });

    expect(polylines(renderer.root)[0].props.tappable).toBe(false);
  });
});
