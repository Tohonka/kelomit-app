import React from 'react';
import {Modal, Text} from 'react-native';
import {act, create, type ReactTestInstance} from 'react-test-renderer';

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
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));
jest.mock('react-i18next', () => ({
  initReactI18next: {type: '3rdParty', init: jest.fn()},
  useTranslation: () => ({
    t: (key: string) => ({
      'map.tripDetails': 'Trip details',
      'dayMap.distance': 'Distance',
      'dayMap.duration': 'Duration',
      'map.averageSpeed': 'Average speed',
      'map.maximumSpeed': 'Maximum speed',
      'common.close': 'Close',
    })[key] ?? key,
  }),
}));
jest.mock('../src/theme', () => {
  const actual = jest.requireActual('../src/theme');
  const {lightColors} = jest.requireActual('../src/theme/colors');
  return {...actual, useTheme: () => ({colors: lightColors, isDark: false})};
});

import TripDetailsModal from '../src/components/map/TripDetailsModal';
import type {DayRouteSegment} from '../src/types';

const segment: DayRouteSegment = {
  id: 20,
  day_id: 4,
  sequence: 0,
  start_ts: '2026-07-24T08:30:00.000Z',
  end_ts: '2026-07-24T09:00:00.000Z',
  origin_stop_id: 10,
  destination_stop_id: 11,
  coordinates: [],
  distance_m: 1250,
  duration_sec: 1800,
  average_speed_mps: 10,
  maximum_speed_mps: 12.5,
  raw_last_ts: '2026-07-24T09:00:00.000Z',
  mode_spans: null,
  still_seconds: null,
  via: null,
  created_at: '',
  updated_at: '',
};

function texts(root: ReactTestInstance): string[] {
  return root.findAllByType(Text).map(node =>
    Array.isArray(node.props.children)
      ? node.props.children.join('')
      : String(node.props.children),
  );
}

it('shows trip endpoints, timing, distance, duration, and speeds', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <TripDetailsModal
        visible
        segment={segment}
        originName="Workshop"
        destinationName="Customer"
        onClose={jest.fn()}
      />,
    );
  });

  expect(texts(renderer.root)).toEqual(expect.arrayContaining([
    'Workshop → Customer',
    '11:30 – 12:00',
    '1.3 km',
    '30m',
    '36.0 km/h',
    '45.0 km/h',
    'Close',
  ]));
});

it('dismisses from the close button, backdrop, and Android back', () => {
  const onClose = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <TripDetailsModal
        visible
        segment={segment}
        originName="Workshop"
        destinationName="Customer"
        onClose={onClose}
      />,
    );
  });

  act(() => renderer.root.findByProps({accessibilityLabel: 'Close'}).props.onPress());
  act(() => renderer.root.findByProps({testID: 'trip-details-backdrop'}).props.onPress());
  act(() => renderer.root.findByType(Modal).props.onRequestClose());
  expect(onClose).toHaveBeenCalledTimes(3);
});
