jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@react-navigation/native', () => ({useNavigation: jest.fn()}));
jest.mock('../src/components/entries/quickAddActions', () => ({
  buildQuickAddActions: jest.fn(() => []),
}));

import {resolveQuickAddDay} from '../src/navigation/QuickAddButton';
import type {Day} from '../src/types';

const current: Day = {
  id: 23,
  date: '2026-07-23',
  started_at: null,
  ended_at: null,
  started_at_2: null,
  ended_at_2: null,
  started_at_source: null,
  ended_at_source: null,
  notes: null,
  created_at: '',
  updated_at: '',
};

it('uses the atomic day returned at press time', async () => {
  const loadToday = jest.fn().mockResolvedValue(current);

  await expect(resolveQuickAddDay(undefined, loadToday)).resolves.toEqual({
    date: '2026-07-23',
    dayId: 23,
  });
  expect(loadToday).toHaveBeenCalledTimes(1);
});

it('preserves an explicit historical target without loading today', async () => {
  const loadToday = jest.fn();
  const target = {date: '2026-07-01', dayId: 1};

  await expect(resolveQuickAddDay(target, loadToday)).resolves.toEqual(target);
  expect(loadToday).not.toHaveBeenCalled();
});
