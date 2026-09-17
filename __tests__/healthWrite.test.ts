jest.mock('react-native-health-connect', () => ({
  initialize: jest.fn(), insertRecords: jest.fn(), deleteRecordsByUuids: jest.fn(), requestPermission: jest.fn(),
}));
jest.mock('../src/db/food', () => ({getFoodEntry: jest.fn(), onFoodChange: jest.fn()}));
jest.mock('../src/store/settingsStore', () => ({useSettingsStore: {getState: () => ({health_write_food: false})}}));
jest.mock('../src/services/diag', () => ({diag: jest.fn()}));

import {nutritionRecordFor} from '../src/services/healthWrite';

it('maps an entry with kcal to a one-minute Nutrition record keyed by our id', () => {
  const r = nutritionRecordFor({id: 42, eaten_at: '2026-09-17T09:30:00.000Z', name: 'Puuro', kcal: 250}, 7);
  expect(r).toMatchObject({
    recordType: 'Nutrition',
    startTime: '2026-09-17T09:30:00.000Z',
    endTime: '2026-09-17T09:31:00.000Z',
    name: 'Puuro',
    energy: {value: 250, unit: 'kilocalories'},
    metadata: {clientRecordId: 'kelomit-food-42', clientRecordVersion: 7},
  });
});

it('has nothing to write for an entry without kcal', () => {
  expect(nutritionRecordFor({id: 1, eaten_at: '2026-09-17T09:30:00.000Z', name: 'Kahvi', kcal: null}, 1)).toBeNull();
});
