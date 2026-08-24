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
    t: (key: string, opts?: Record<string, string>) => {
      const table: Record<string, string> = {
        'map.tripDetails': 'Trip details',
        'dayMap.distance': 'Distance',
        'dayMap.duration': 'Duration',
        'map.averageSpeed': 'Average speed',
        'map.maximumSpeed': 'Maximum speed',
        'common.close': 'Close',
        'map.averagePace': 'Average pace',
        'map.notMoving': 'Not moving',
        'map.modes': 'Travel modes',
        'map.modeVehicle': 'Driving',
        'map.modeFoot': 'Walking',
        'map.modeCycle': 'Cycling',
        'map.modeStill': 'Paused',
        'map.modeUnknown': 'Unknown',
        'map.viaHeader': 'During the trip',
        'map.viaPause': 'Paused {{duration}} at {{name}} ({{time}})',
        'map.viaPassthrough': 'Passed {{name}} ({{time}})',
        'map.viaUnnamed': 'unnamed stop',
      };
      let value = table[key] ?? key;
      if (opts) {
        for (const [k, v] of Object.entries(opts)) {
          value = value.replace(`{{${k}}}`, v);
        }
      }
      return value;
    },
  }),
}));
jest.mock('../src/theme', () => {
  const actual = jest.requireActual('../src/theme');
  const {lightColors} = jest.requireActual('../src/theme/colors');
  return {...actual, useTheme: () => ({colors: lightColors, isDark: false})};
});

import TripDetailsModal, {formatPace} from '../src/components/map/TripDetailsModal';
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
    'Workshop',
    'Customer',
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

it('formats pace as m:ss per km and omits it under 200 m', () => {
  expect(formatPace(2000, 600)).toBe('5:00 /km');
  expect(formatPace(150, 60)).toBeNull();
  // 1000 m / 299.6 s => 299.6 s/km; naive Math.round(secPerKm % 60) yields
  // minutes=4, seconds=60 ("4:60 /km") unless the carry is handled.
  expect(formatPace(1000, 299.6)).toBe('5:00 /km');
});

it('shows still time, mode breakdown and via rows when data exists', () => {
  const enriched: DayRouteSegment = {
    ...segment,
    still_seconds: 180,
    mode_spans: [
      {mode: 'vehicle', startTs: '2026-07-24T08:30:00.000Z', endTs: '2026-07-24T08:50:00.000Z'},
      {mode: 'foot', startTs: '2026-07-24T08:50:00.000Z', endTs: '2026-07-24T08:55:00.000Z'},
      {mode: 'unknown', startTs: '2026-07-24T08:55:00.000Z', endTs: '2026-07-24T08:55:30.000Z'},
    ],
    via: [
      {
        kind: 'pause',
        startTs: '2026-07-24T08:40:00.000Z',
        endTs: '2026-07-24T08:45:00.000Z',
        name: 'Citymarket',
      },
      {kind: 'passthrough', ts: '2026-07-24T08:52:00.000Z', name: 'Kiosk'},
    ],
  };
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <TripDetailsModal
        visible
        segment={enriched}
        originName="Workshop"
        destinationName="Customer"
        onClose={jest.fn()}
      />,
    );
  });

  const allText = texts(renderer.root).join(' | ');
  expect(allText).toContain('3m');
  expect(allText).toContain('Driving');
  expect(allText).toContain('Walking');
  expect(allText).not.toContain('Unknown');
  expect(allText).toContain('Citymarket');
  expect(allText).toContain('Kiosk');
});

it('renders no new rows for a legacy segment (null enrichment)', () => {
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

  const allText = texts(renderer.root);
  // Note: pace is derived from distance_m/duration_sec, which are NOT
  // enrichment fields (they've always existed), so it legitimately shows
  // here too — only the mode_spans/still_seconds/via-gated rows are absent.
  expect(allText.find(text => text.includes('Not moving'))).toBeUndefined();
  expect(allText.find(text => text.includes('Travel modes'))).toBeUndefined();
  expect(allText.find(text => text.includes('During the trip'))).toBeUndefined();
});
