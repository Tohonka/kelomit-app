import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {act, create, type ReactTestInstance} from 'react-test-renderer';

jest.mock('react-native-maps', () => {
  const {View: NativeView} = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: NativeView,
    Marker: NativeView,
    Polyline: NativeView,
    PROVIDER_GOOGLE: 'google',
  };
});
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));
jest.mock('react-i18next', () => {
  const messages = jest.requireActual('../src/i18n/locales/en').default;
  const translate = (key: string) => {
    let value: unknown = messages;
    for (const part of key.split('.')) {
      value =
        typeof value === 'object' && value !== null
          ? (value as Record<string, unknown>)[part]
          : undefined;
    }
    return typeof value === 'string' ? value : key;
  };
  return {
    initReactI18next: {type: '3rdParty', init: jest.fn()},
    useTranslation: () => ({t: translate}),
  };
});
jest.mock('../src/theme', () => {
  const actual = jest.requireActual('../src/theme');
  const {lightColors} = jest.requireActual('../src/theme/colors');
  return {...actual, useTheme: () => ({colors: lightColors, isDark: false})};
});

import TripList from '../src/components/map/TripList';
import type {DayRouteSegment, DayRouteStop} from '../src/types';

const stops: DayRouteStop[] = [
  {
    id: 10,
    day_id: 4,
    start_ts: '2026-07-24T08:00:00.000Z',
    end_ts: '2026-07-24T08:30:00.000Z',
    latitude: 60.17,
    longitude: 24.94,
    saved_location_id: 1,
    named_place_id: null,
    google_place_id: null,
    display_name: 'Frozen origin',
    name_source: 'saved',
    user_edited: false,
    created_at: '2026-07-24T08:30:00.000Z',
    updated_at: '2026-07-24T08:30:00.000Z',
  },
  {
    id: 11,
    day_id: 4,
    start_ts: '2026-07-24T09:00:00.000Z',
    end_ts: '2026-07-24T09:30:00.000Z',
    latitude: 60.18,
    longitude: 24.95,
    saved_location_id: null,
    named_place_id: 2,
    google_place_id: null,
    display_name: 'Frozen destination',
    name_source: 'reusable',
    user_edited: true,
    created_at: '2026-07-24T09:30:00.000Z',
    updated_at: '2026-07-24T09:30:00.000Z',
  },
];

const segment = (
  overrides: Partial<DayRouteSegment> = {},
): DayRouteSegment => ({
  id: 20,
  day_id: 4,
  sequence: 0,
  start_ts: '2026-07-24T08:30:00.000Z',
  end_ts: '2026-07-24T09:00:00.000Z',
  origin_stop_id: 10,
  destination_stop_id: 11,
  coordinates: [
    {latitude: 60.17, longitude: 24.94},
    {latitude: 60.18, longitude: 24.95},
  ],
  distance_m: 1250,
  duration_sec: 1800,
  average_speed_mps: 0.69,
  maximum_speed_mps: 1.2,
  raw_last_ts: '2026-07-24T09:00:00.000Z',
  created_at: '2026-07-24T09:00:00.000Z',
  updated_at: '2026-07-24T09:00:00.000Z',
  ...overrides,
});

function text(root: ReactTestInstance): string[] {
  const flatten = (value: unknown): string =>
    Array.isArray(value)
      ? value.map(flatten).join('')
      : typeof value === 'string'
        ? value
        : '';
  return root.findAllByType(Text).map(node => flatten(node.props.children));
}

it('shows chronological frozen endpoints, local times, distance, duration, and matching palette swatches', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <TripList
        stops={stops}
        segments={[
          segment(),
          segment({
            id: 21,
            sequence: 1,
            start_ts: '2026-07-24T09:30:00.000Z',
            end_ts: '2026-07-24T09:35:00.000Z',
            origin_stop_id: 11,
            destination_stop_id: null,
            distance_m: 250,
            duration_sec: 300,
          }),
        ]}
      />,
    );
  });

  expect(text(renderer.root)).toEqual(
    expect.arrayContaining([
      'Frozen origin → Frozen destination',
      '11:30 – 12:00',
      '1.3 km · 30m',
      'Frozen destination → Day end',
      '12:30 – 12:35',
      '250 m · 5m',
    ]),
  );
  expect(
    StyleSheet.flatten(
      renderer.root.findByProps({testID: 'trip-swatch-0'}).props.style,
    ),
  ).toEqual(expect.objectContaining({backgroundColor: '#2563EB'}));
  expect(
    StyleSheet.flatten(
      renderer.root.findByProps({testID: 'trip-swatch-1'}).props.style,
    ),
  ).toEqual(expect.objectContaining({backgroundColor: '#D97706'}));
  const firstRow = renderer.root.findByProps({
    accessibilityLabel:
      'Frozen origin → Frozen destination, 11:30 – 12:00, 1.3 km · 30m',
  });
  expect(firstRow.type).toBe(View);
  expect(firstRow.props.accessible).toBe(true);
});

it('uses localized day boundaries for null endpoints', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <TripList
        stops={stops}
        segments={[
          segment({origin_stop_id: null, destination_stop_id: null}),
        ]}
      />,
    );
  });

  expect(text(renderer.root)).toContain('Day start → Day end');
});

it('renders the existing no-route state without a blank card', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<TripList stops={[]} segments={[]} />);
  });

  expect(text(renderer.root)).toContain('Nothing tracked this day.');
  expect(renderer.root.findAllByProps({testID: 'trip-list'})).toHaveLength(0);
  expect(renderer.root.findAllByType(View)).toHaveLength(0);
});
