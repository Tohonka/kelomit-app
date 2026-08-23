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

it('increments and decrements by 1 m on press', () => {
  const onChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<RadiusEditor value={150} onChange={onChange} />);
  });

  act(() => renderer.root.findByProps({accessibilityLabel: 'Increase radius'}).props.onPressIn());
  act(() => renderer.root.findByProps({accessibilityLabel: 'Increase radius'}).props.onPressOut());
  expect(onChange).toHaveBeenLastCalledWith(151);

  act(() => renderer.root.findByProps({accessibilityLabel: 'Decrease radius'}).props.onPressIn());
  act(() => renderer.root.findByProps({accessibilityLabel: 'Decrease radius'}).props.onPressOut());
  expect(onChange).toHaveBeenLastCalledWith(149);
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
