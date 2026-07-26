import {parseNativeEvent} from '../src/native/backgroundLocation';

test('parses a persisted crossing with its native sequence', () => {
  expect(parseNativeEvent(JSON.stringify({
    sequence: 7,
    type: 'crossing',
    locationId: 4,
    kind: 'work',
    direction: 'exit',
    timestamp: 1784810000000,
    localDate: '2026-07-23',
    generation: 3,
    latitude: null,
    longitude: null,
  }))).toEqual({
    sequence: 7,
    type: 'crossing',
    locationId: 4,
    kind: 'work',
    direction: 'exit',
    timestamp: 1784810000000,
    localDate: '2026-07-23',
    generation: 3,
    latitude: null,
    longitude: null,
  });
});

test('rejects malformed native events', () => {
  expect(parseNativeEvent('{"type":"crossing"}')).toBeNull();
  expect(parseNativeEvent('not json')).toBeNull();
  expect(parseNativeEvent(JSON.stringify({
    sequence: 7,
    type: 'crossing',
    locationId: 4,
    kind: 'work',
    direction: 'exit',
    timestamp: 1784810000000,
    latitude: null,
    longitude: null,
  }))).toBeNull();
  expect(parseNativeEvent(JSON.stringify({
    sequence: 8,
    type: 'crossing',
    locationId: 4,
    kind: 'office',
    direction: 'exit',
    timestamp: 1784810000000,
    latitude: null,
    longitude: null,
  }))).toBeNull();
});

test('parses token-scoped workday decisions', () => {
  expect(parseNativeEvent(JSON.stringify({
    sequence: 8,
    type: 'day_end_prompted',
    token: 'exit-4-1784810000000',
    exitTimestamp: 1784810000000,
    timestamp: 1784812700000,
  }))).toEqual({
    sequence: 8,
    type: 'day_end_prompted',
    token: 'exit-4-1784810000000',
    exitTimestamp: 1784810000000,
    timestamp: 1784812700000,
  });
});

test('parses only supported persisted activity transitions', () => {
  expect(parseNativeEvent(JSON.stringify({
    sequence: 9,
    type: 'activity',
    activity: 'vehicle',
    transition: 'enter',
    timestamp: 1785085200000,
  }))).toEqual({
    sequence: 9,
    type: 'activity',
    activity: 'vehicle',
    transition: 'enter',
    timestamp: 1785085200000,
  });
  expect(parseNativeEvent(JSON.stringify({
    sequence: 10,
    type: 'activity',
    activity: 'car',
    transition: 'enter',
    timestamp: 1785085200000,
  }))).toBeNull();
  expect(parseNativeEvent(JSON.stringify({
    sequence: 11,
    type: 'activity',
    activity: 'walking',
    transition: 'pause',
    timestamp: 1785085200000,
  }))).toBeNull();
});
