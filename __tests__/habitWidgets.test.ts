import {buildHabitWidgetState} from '../src/services/habitWidgets';
import type {Habit} from '../src/types';

const habit = (o: Partial<Habit>): Habit => ({
  id: 1, category_id: 1, title: 'h', description: null, icon: 'run', color: null,
  goal_kind: null, goal_value: null, archived: false, created_at: '', updated_at: '', ...o,
});
const glyph = (n: string) => ({run: 0xF0001, 'circle-outline': 0xF0002} as Record<string, number>)[n];

it('shapes today state with glyph codepoints, colours and a circle fallback', () => {
  const s = buildHabitWidgetState(
    [habit({id: 1}), habit({id: 2, icon: 'no-such-glyph', color: '#FB40AD', title: 'Swedish'})],
    new Map([[1, true]]),
    '2026-09-07',
    glyph,
  );
  expect(s).toEqual({
    date: '2026-09-07',
    habits: {
      1: {done: true, title: 'h', icon_cp: 0xF0001, color: null},
      2: {done: false, title: 'Swedish', icon_cp: 0xF0002, color: '#FB40AD'},
    },
  });
});
