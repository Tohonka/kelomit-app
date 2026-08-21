import React from 'react';
import {Text, TouchableOpacity} from 'react-native';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';

const mockUseDayMapData = jest.fn();
const mockReloadRouteHistory = jest.fn();

jest.mock('react-i18next', () => ({
  initReactI18next: {type: '3rdParty', init: jest.fn()},
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'map.places': 'Places',
        'map.trips': 'Trips',
        'map.noVisits': 'No stops',
        'map.unknownPlace': 'Unknown place',
      })[key] ?? key,
  }),
}));
jest.mock('../src/theme', () => {
  const actual = jest.requireActual('../src/theme');
  const {lightColors} = jest.requireActual('../src/theme/colors');
  return {...actual, useTheme: () => ({colors: lightColors, isDark: false})};
});
jest.mock('@react-navigation/native', () => {
  const ReactModule = jest.requireActual('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      ReactModule.useEffect(callback, [callback]);
    },
    useNavigation: () => ({navigate: jest.fn()}),
  };
});
jest.mock('../src/navigation/shellMetrics', () => ({
  useShellPadding: () => ({paddingTop: 0, paddingBottom: 0}),
}));
jest.mock('../src/store/dayStore', () => ({
  useDayStore: (selector: (state: object) => unknown) =>
    selector({today: null, loadToday: jest.fn()}),
}));
jest.mock('../src/store/locationStore', () => ({
  useLocationStore: () => ({locations: [], loaded: true, load: jest.fn()}),
}));
jest.mock('../src/screens/DayMapScreen', () => ({
  useDayMapData: (dayId: number) => mockUseDayMapData(dayId),
  DayMapCanvas: () => null,
  DayMapView: () => null,
  formatDistance: (distance: number) => `${distance} m`,
}));
jest.mock('../src/db/routeHistory', () => ({
  getNearbyLocalPlaces: jest.fn(),
  setDayStopName: jest.fn(),
  setAutomaticGoogleStopName: jest.fn(),
  createNamedPlaceForStop: jest.fn(),
}));
jest.mock('../src/services/placesService', () => ({
  resolvePlaceName: jest.fn(),
  resolvePlaceSnapshot: jest.fn(),
  resolvePlaceCandidates: jest.fn(),
}));
jest.mock('../src/services/routeHistoryService', () => ({
  refreshRouteDay: jest.fn(),
}));
jest.mock('../src/components/map/PlaceNameSheet', () => {
  const ReactModule = jest.requireActual('react');
  const {View: NativeView} = jest.requireActual('react-native');
  return function MockPlaceNameSheet(props: object) {
    return ReactModule.createElement(NativeView, {
      testID: 'place-name-sheet',
      ...props,
    });
  };
});

import {
  createNamedPlaceForStop,
  getNearbyLocalPlaces,
  setAutomaticGoogleStopName,
  setDayStopName,
} from '../src/db/routeHistory';
import {
  resolvePlaceCandidates,
  resolvePlaceSnapshot,
} from '../src/services/placesService';
import {refreshRouteDay} from '../src/services/routeHistoryService';
import {MapOverview} from '../src/screens/MapTab';

const stop = {
  id: 7,
  day_id: 4,
  start_ts: '2026-07-24T08:00:00.000Z',
  end_ts: '2026-07-24T09:00:00.000Z',
  latitude: 60.17,
  longitude: 24.94,
  saved_location_id: null,
  named_place_id: null,
  google_place_id: 'old-google',
  display_name: 'Historical label',
  name_source: 'google' as const,
  user_edited: true,
  created_at: '2026-07-24T09:00:00.000Z',
  updated_at: '2026-07-24T09:00:00.000Z',
};
const dayFiveStop = {
  ...stop,
  id: 8,
  day_id: 5,
  display_name: 'Day five',
};
const secondStop = {
  ...stop,
  id: 9,
  start_ts: '2026-07-24T10:00:00.000Z',
  end_ts: '2026-07-24T10:30:00.000Z',
  latitude: 60.18,
  longitude: 24.95,
  display_name: 'Second stop',
};
const unnamedStop = {
  ...stop,
  id: 10,
  google_place_id: null,
  display_name: null,
  name_source: 'unknown' as const,
  user_edited: false,
};
const localChoice = {
  type: 'saved' as const,
  id: 2,
  name: 'Workshop',
  distanceM: 12,
};
const googleChoice = {
  placeId: 'google-2',
  name: 'Nearby cafe',
  latitude: 60.1701,
  longitude: 24.9401,
  distanceM: 14,
};

const getNearbyLocalPlacesMock = getNearbyLocalPlaces as jest.MockedFunction<
  typeof getNearbyLocalPlaces
>;
const setDayStopNameMock = setDayStopName as jest.MockedFunction<
  typeof setDayStopName
>;
const setAutomaticGoogleStopNameMock =
  setAutomaticGoogleStopName as jest.MockedFunction<
    typeof setAutomaticGoogleStopName
  >;
const createNamedPlaceForStopMock =
  createNamedPlaceForStop as jest.MockedFunction<
    typeof createNamedPlaceForStop
  >;
const resolvePlaceCandidatesMock =
  resolvePlaceCandidates as jest.MockedFunction<
    typeof resolvePlaceCandidates
  >;
const resolvePlaceSnapshotMock =
  resolvePlaceSnapshot as jest.MockedFunction<typeof resolvePlaceSnapshot>;
const refreshRouteDayMock = refreshRouteDay as jest.MockedFunction<
  typeof refreshRouteDay
>;

function button(root: ReactTestInstance, label: string): ReactTestInstance {
  return root.findAllByType(TouchableOpacity).find(
    item => String(item.props.accessibilityLabel).startsWith(label),
  )!;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return {promise, resolve};
}

function overview(dayId: number) {
  return (
    <MapOverview
      dayId={dayId}
      title="Map"
      topInset={0}
      bottomInset={0}
      onFullScreen={jest.fn()}
      onOpenEntry={jest.fn()}
      onAddNote={jest.fn()}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseDayMapData.mockImplementation((dayId: number) => ({
    segments: [],
    stops: dayId === 5 ? [dayFiveStop] : [stop],
    routeCoords: [],
    buckets: [],
    region: undefined,
    stats: {distanceM: 0, durationSec: 0},
    isReady: true,
    isEmpty: true,
    reloadRouteHistory: mockReloadRouteHistory,
  }));
  mockReloadRouteHistory.mockResolvedValue(undefined);
  getNearbyLocalPlacesMock.mockResolvedValue([localChoice]);
  setDayStopNameMock.mockResolvedValue();
  createNamedPlaceForStopMock.mockResolvedValue();
  setAutomaticGoogleStopNameMock.mockResolvedValue(false);
  resolvePlaceCandidatesMock.mockResolvedValue([googleChoice]);
  resolvePlaceSnapshotMock.mockResolvedValue(null);
  refreshRouteDayMock.mockResolvedValue();
});

it('loads persisted stops and wires saved and reusable name updates', async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(overview(4));
    await Promise.resolve();
  });

  act(() => {
    button(renderer.root, 'Historical label').props.onPress();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  const sheet = renderer.root.findByProps({testID: 'place-name-sheet'});
  expect(sheet.props.currentName).toBe('Historical label');
  expect(sheet.props.localChoices).toEqual([localChoice]);
  expect(sheet.props.googleCandidates).toEqual([googleChoice]);

  await act(async () => {
    await sheet.props.onChoose(localChoice);
  });
  expect(setDayStopNameMock).toHaveBeenCalledWith(7, localChoice);
  expect(mockReloadRouteHistory).toHaveBeenCalledTimes(1);

  await act(async () => {
    await sheet.props.onCreateName('New anchor');
  });
  expect(createNamedPlaceForStopMock).toHaveBeenCalledWith(7, 'New anchor');
  expect(mockReloadRouteHistory).toHaveBeenCalledTimes(2);
  expect(refreshRouteDayMock).not.toHaveBeenCalled();
});

it('snapshots an automatic Google result into an unnamed stop and reloads once', async () => {
  mockUseDayMapData.mockReturnValue({
    segments: [],
    stops: [unnamedStop],
    routeCoords: [],
    buckets: [],
    region: undefined,
    stats: {distanceM: 0, durationSec: 0},
    isReady: true,
    isEmpty: true,
    reloadRouteHistory: mockReloadRouteHistory,
  });
  resolvePlaceSnapshotMock.mockResolvedValue({
    name: 'Cached cafe',
    placeId: 'cached-id',
  });
  setAutomaticGoogleStopNameMock.mockResolvedValue(true);

  await act(async () => {
    create(overview(4));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(resolvePlaceSnapshotMock).toHaveBeenCalledWith(60.17, 24.94);
  expect(setAutomaticGoogleStopNameMock).toHaveBeenCalledWith(10, {
    name: 'Cached cafe',
    placeId: 'cached-id',
  });
  expect(mockReloadRouteHistory).toHaveBeenCalledTimes(1);
});

it('leaves an unnamed stop unchanged when automatic lookup has no result', async () => {
  mockUseDayMapData.mockReturnValue({
    segments: [],
    stops: [unnamedStop],
    routeCoords: [],
    buckets: [],
    region: undefined,
    stats: {distanceM: 0, durationSec: 0},
    isReady: true,
    isEmpty: true,
    reloadRouteHistory: mockReloadRouteHistory,
  });

  await act(async () => {
    create(overview(4));
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(resolvePlaceSnapshotMock).toHaveBeenCalledTimes(1);
  expect(setAutomaticGoogleStopNameMock).not.toHaveBeenCalled();
  expect(mockReloadRouteHistory).not.toHaveBeenCalled();
});

it('keeps an explicit choice when it wins a race with automatic lookup', async () => {
  const automatic = deferred<{name: string; placeId: string} | null>();
  mockUseDayMapData.mockReturnValue({
    segments: [],
    stops: [unnamedStop],
    routeCoords: [],
    buckets: [],
    region: undefined,
    stats: {distanceM: 0, durationSec: 0},
    isReady: true,
    isEmpty: true,
    reloadRouteHistory: mockReloadRouteHistory,
  });
  resolvePlaceSnapshotMock.mockReturnValue(automatic.promise);
  setAutomaticGoogleStopNameMock.mockResolvedValue(false);
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(overview(4));
    await Promise.resolve();
  });
  act(() => {
    button(renderer.root, 'Unknown place').props.onPress();
  });
  await act(async () => {
    await Promise.resolve();
  });

  const sheet = renderer.root.findByProps({testID: 'place-name-sheet'});
  await act(async () => {
    await sheet.props.onChoose(localChoice);
  });
  await act(async () => {
    automatic.resolve({name: 'Late Google', placeId: 'late-id'});
    await automatic.promise;
    await Promise.resolve();
  });

  expect(setDayStopNameMock).toHaveBeenCalledWith(10, localChoice);
  expect(setAutomaticGoogleStopNameMock).toHaveBeenCalledWith(10, {
    name: 'Late Google',
    placeId: 'late-id',
  });
  expect(mockReloadRouteHistory).toHaveBeenCalledTimes(1);
});

it('shows Google failures without replacing local choices or the historical name', async () => {
  resolvePlaceCandidatesMock.mockRejectedValue(new Error('offline'));
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(overview(4));
    await Promise.resolve();
  });

  act(() => {
    button(renderer.root, 'Historical label').props.onPress();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  const sheet = renderer.root.findByProps({testID: 'place-name-sheet'});
  expect(sheet.props.currentName).toBe('Historical label');
  expect(sheet.props.localChoices).toEqual([localChoice]);
  expect(sheet.props.googleCandidates).toEqual([]);
  expect(sheet.props.googleError).toBe(true);
});

it('keeps the newer same-day stop open when an older local lookup finishes last', async () => {
  const first = deferred<typeof localChoice[]>();
  const second = deferred<typeof localChoice[]>();
  mockUseDayMapData.mockReturnValue({
    segments: [],
    stops: [stop, secondStop],
    routeCoords: [],
    buckets: [],
    region: undefined,
    stats: {distanceM: 0, durationSec: 0},
    isReady: true,
    isEmpty: true,
    reloadRouteHistory: mockReloadRouteHistory,
  });
  getNearbyLocalPlacesMock.mockImplementation(lat =>
    lat === stop.latitude ? first.promise : second.promise,
  );
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(overview(4));
    await Promise.resolve();
  });

  act(() => {
    button(renderer.root, 'Historical label').props.onPress();
    button(renderer.root, 'Second stop').props.onPress();
  });
  await act(async () => {
    second.resolve([localChoice]);
    await second.promise;
  });
  expect(
    renderer.root.findByProps({testID: 'place-name-sheet'}).props.currentName,
  ).toBe('Second stop');

  await act(async () => {
    first.resolve([]);
    await first.promise;
  });
  expect(
    renderer.root.findByProps({testID: 'place-name-sheet'}).props.currentName,
  ).toBe('Second stop');
});

it('includes visible stop timing in its accessibility label and marks Trips as a heading', async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(overview(4));
    await Promise.resolve();
  });

  expect(
    renderer.root.findAllByType(TouchableOpacity).some(
      item =>
        item.props.accessibilityLabel ===
        'Historical label, 11:00 – 12:00, 1h 0m',
    ),
  ).toBe(true);
  expect(
    renderer.root.findAllByType(Text).find(item => item.props.children === 'Trips')
      ?.props.accessibilityRole,
  ).toBe('header');
  const labels = renderer.root.findAllByType(Text).map(item => item.props.children);
  expect(labels.indexOf('Trips')).toBeLessThan(labels.indexOf('Places'));
});

it('discards prior-day results and prevents an old selection acting after day change', async () => {
  const oldReload = deferred<void>();
  mockReloadRouteHistory.mockReturnValue(oldReload.promise);

  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(overview(4));
    await Promise.resolve();
  });
  act(() => {
    button(renderer.root, 'Historical label').props.onPress();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  const oldChoose = renderer.root.findByProps({
    testID: 'place-name-sheet',
  }).props.onChoose;
  let oldSave!: Promise<void>;
  act(() => {
    oldSave = oldChoose(localChoice);
  });

  await act(async () => {
    renderer.update(overview(5));
    await Promise.resolve();
  });
  expect(
    renderer.root.findByProps({testID: 'place-name-sheet'}).props.visible,
  ).toBe(false);
  expect(
    renderer.root.findAllByType(TouchableOpacity).some(
      item => item.props.accessibilityLabel === 'Historical label',
    ),
  ).toBe(false);

  await act(async () => {
    await oldChoose(localChoice);
  });
  expect(setDayStopNameMock).toHaveBeenCalledTimes(1);

  expect(button(renderer.root, 'Day five')).toBeDefined();

  await act(async () => {
    oldReload.resolve();
    await oldSave;
  });
  expect(button(renderer.root, 'Day five')).toBeDefined();
  expect(
    renderer.root.findAllByType(TouchableOpacity).some(
      item => item.props.accessibilityLabel === 'Historical label',
    ),
  ).toBe(false);
});

it('does not let an old save invalidate an in-flight new-day load', async () => {
  const oldSave = deferred<void>();
  setDayStopNameMock.mockReturnValue(oldSave.promise);

  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(overview(4));
    await Promise.resolve();
  });
  act(() => {
    button(renderer.root, 'Historical label').props.onPress();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  const savePromise = renderer.root.findByProps({
    testID: 'place-name-sheet',
  }).props.onChoose(localChoice);

  await act(async () => {
    renderer.update(overview(5));
    await Promise.resolve();
  });
  await act(async () => {
    oldSave.resolve();
    await savePromise;
  });

  expect(mockReloadRouteHistory).not.toHaveBeenCalled();
  expect(button(renderer.root, 'Day five')).toBeDefined();
});

it('propagates persistence failures so the sheet can keep the edit open', async () => {
  setDayStopNameMock.mockRejectedValue(new Error('write failed'));
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(overview(4));
    await Promise.resolve();
  });
  act(() => {
    button(renderer.root, 'Historical label').props.onPress();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  const sheet = renderer.root.findByProps({testID: 'place-name-sheet'});
  await expect(sheet.props.onChoose(localChoice)).rejects.toThrow('write failed');
});
