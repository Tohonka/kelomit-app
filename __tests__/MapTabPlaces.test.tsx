import React from 'react';
import {TouchableOpacity} from 'react-native';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';

jest.mock('react-i18next', () => ({
  initReactI18next: {type: '3rdParty', init: jest.fn()},
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'map.places': 'Places',
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
  useDayMapData: () => ({
    routeCoords: [],
    buckets: [],
    region: undefined,
    stats: {distanceM: 0, durationSec: 0},
    points: [],
    isEmpty: true,
  }),
  DayMapCanvas: () => null,
  DayMapView: () => null,
  formatDistance: (distance: number) => `${distance} m`,
}));
jest.mock('../src/db/routeHistory', () => ({
  getDayRouteHistory: jest.fn(),
  getNearbyLocalPlaces: jest.fn(),
  setDayStopName: jest.fn(),
  createNamedPlaceForStop: jest.fn(),
}));
jest.mock('../src/services/placesService', () => ({
  resolvePlaceName: jest.fn(),
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
  getDayRouteHistory,
  getNearbyLocalPlaces,
  setDayStopName,
} from '../src/db/routeHistory';
import {resolvePlaceCandidates} from '../src/services/placesService';
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

const getDayRouteHistoryMock = getDayRouteHistory as jest.MockedFunction<
  typeof getDayRouteHistory
>;
const getNearbyLocalPlacesMock = getNearbyLocalPlaces as jest.MockedFunction<
  typeof getNearbyLocalPlaces
>;
const setDayStopNameMock = setDayStopName as jest.MockedFunction<
  typeof setDayStopName
>;
const createNamedPlaceForStopMock =
  createNamedPlaceForStop as jest.MockedFunction<
    typeof createNamedPlaceForStop
  >;
const resolvePlaceCandidatesMock =
  resolvePlaceCandidates as jest.MockedFunction<
    typeof resolvePlaceCandidates
  >;
const refreshRouteDayMock = refreshRouteDay as jest.MockedFunction<
  typeof refreshRouteDay
>;

function button(root: ReactTestInstance, label: string): ReactTestInstance {
  return root.findAllByType(TouchableOpacity).find(
    item => item.props.accessibilityLabel === label,
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
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  getDayRouteHistoryMock.mockResolvedValue({stops: [stop], segments: []});
  getNearbyLocalPlacesMock.mockResolvedValue([localChoice]);
  setDayStopNameMock.mockResolvedValue();
  createNamedPlaceForStopMock.mockResolvedValue();
  resolvePlaceCandidatesMock.mockResolvedValue([googleChoice]);
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
  expect(getDayRouteHistoryMock).toHaveBeenCalledTimes(2);

  await act(async () => {
    await sheet.props.onCreateName('New anchor');
  });
  expect(createNamedPlaceForStopMock).toHaveBeenCalledWith(7, 'New anchor');
  expect(getDayRouteHistoryMock).toHaveBeenCalledTimes(3);
  expect(refreshRouteDayMock).toHaveBeenCalledWith(4);
  expect(
    getDayRouteHistoryMock.mock.invocationCallOrder[2],
  ).toBeLessThan(refreshRouteDayMock.mock.invocationCallOrder[0]);
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

it('discards prior-day results and prevents an old selection acting after day change', async () => {
  const oldReload = deferred<{stops: typeof stop[]; segments: []}>();
  const newLoad = deferred<{stops: typeof dayFiveStop[]; segments: []}>();
  getDayRouteHistoryMock
    .mockResolvedValueOnce({stops: [stop], segments: []})
    .mockReturnValueOnce(oldReload.promise)
    .mockReturnValueOnce(newLoad.promise);

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

  await act(async () => {
    newLoad.resolve({stops: [dayFiveStop], segments: []});
    await newLoad.promise;
  });
  expect(button(renderer.root, 'Day five')).toBeDefined();

  await act(async () => {
    oldReload.resolve({stops: [stop], segments: []});
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
  const newLoad = deferred<{stops: typeof dayFiveStop[]; segments: []}>();
  let dayFourLoads = 0;
  getDayRouteHistoryMock.mockImplementation(dayId => {
    if (dayId === 5) {
      return newLoad.promise;
    }
    dayFourLoads += 1;
    return Promise.resolve({stops: [stop], segments: []});
  });
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
  await act(async () => {
    newLoad.resolve({stops: [dayFiveStop], segments: []});
    await newLoad.promise;
  });

  expect(dayFourLoads).toBe(1);
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
