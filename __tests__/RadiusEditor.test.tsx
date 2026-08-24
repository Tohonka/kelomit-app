import React from 'react';
import {TextInput} from 'react-native';
import {act, create} from 'react-test-renderer';

jest.mock('react-i18next', () => ({
  initReactI18next: {type: '3rdParty', init: jest.fn()},
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string | number>) => {
      const table: Record<string, string> = {
        'location.decreaseRadius': 'Decrease radius',
        'location.increaseRadius': 'Increase radius',
        'location.editRadius': 'Edit radius',
        'location.radius': '{{m}} m radius',
      };
      let value = table[key] ?? key;
      if (opts) {
        for (const [k, v] of Object.entries(opts)) {
          value = value.replace(`{{${k}}}`, String(v));
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

import RadiusEditor from '../src/components/ui/RadiusEditor';

const REPEAT_DELAY_MS = 350;
const REPEAT_INTERVAL_MS = 80;

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

it('commits once with the incremented value on press release', () => {
  const onChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<RadiusEditor value={150} onChange={onChange} />);
  });

  act(() => renderer.root.findByProps({accessibilityLabel: 'Increase radius'}).props.onPressIn());
  act(() => renderer.root.findByProps({accessibilityLabel: 'Increase radius'}).props.onPressOut());

  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(151);
});

it('commits once with the decremented value on press release', () => {
  const onChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<RadiusEditor value={150} onChange={onChange} />);
  });

  act(() => renderer.root.findByProps({accessibilityLabel: 'Decrease radius'}).props.onPressIn());
  act(() => renderer.root.findByProps({accessibilityLabel: 'Decrease radius'}).props.onPressOut());

  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(149);
});

it('holding auto-repeats the display locally and commits exactly once on release', () => {
  const onChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<RadiusEditor value={150} onChange={onChange} />);
  });

  act(() => renderer.root.findByProps({accessibilityLabel: 'Increase radius'}).props.onPressIn());
  // Past the initial delay plus two repeat ticks: +1 (press) +1 +1 (two ticks) = +3.
  act(() => {
    jest.advanceTimersByTime(REPEAT_DELAY_MS + 2 * REPEAT_INTERVAL_MS);
  });
  expect(onChange).not.toHaveBeenCalled(); // no commit mid-hold, only on release

  act(() => renderer.root.findByProps({accessibilityLabel: 'Increase radius'}).props.onPressOut());

  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(153);
});

it('commits a typed value on submit', () => {
  const onChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<RadiusEditor value={150} onChange={onChange} />);
  });

  act(() => renderer.root.findByProps({accessibilityLabel: 'Edit radius'}).props.onPress());
  const input = renderer.root.findByType(TextInput);
  act(() => input.props.onChangeText('12'));
  act(() => renderer.root.findByType(TextInput).props.onSubmitEditing());

  expect(onChange).toHaveBeenCalledWith(12);
});

it('does not call onChange for non-numeric typed input', () => {
  const onChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<RadiusEditor value={150} onChange={onChange} />);
  });

  act(() => renderer.root.findByProps({accessibilityLabel: 'Edit radius'}).props.onPress());
  act(() => renderer.root.findByType(TextInput).props.onChangeText('abc'));
  act(() => renderer.root.findByType(TextInput).props.onSubmitEditing());

  expect(onChange).not.toHaveBeenCalled();
});

it('commits a typed value that differs from the stepped display even when it equals the stale prop', () => {
  // Step first (parent hasn't re-rendered, so `value` is still 150 while the
  // display is 151), then type the original 150 back. The write must land.
  const onChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<RadiusEditor value={150} onChange={onChange} />);
  });

  act(() => renderer.root.findByProps({accessibilityLabel: 'Increase radius'}).props.onPressIn());
  act(() => renderer.root.findByProps({accessibilityLabel: 'Increase radius'}).props.onPressOut());
  expect(onChange).toHaveBeenLastCalledWith(151);

  act(() => renderer.root.findByProps({accessibilityLabel: 'Edit radius'}).props.onPress());
  act(() => renderer.root.findByType(TextInput).props.onChangeText('150'));
  act(() => renderer.root.findByType(TextInput).props.onSubmitEditing());

  expect(onChange).toHaveBeenCalledTimes(2);
  expect(onChange).toHaveBeenLastCalledWith(150);
});

it('does not call onChange when the typed value matches the current one (tap-away no-op)', () => {
  const onChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<RadiusEditor value={150} onChange={onChange} />);
  });

  act(() => renderer.root.findByProps({accessibilityLabel: 'Edit radius'}).props.onPress());
  act(() => renderer.root.findByType(TextInput).props.onChangeText('150'));
  act(() => renderer.root.findByType(TextInput).props.onSubmitEditing());

  expect(onChange).not.toHaveBeenCalled();
});
