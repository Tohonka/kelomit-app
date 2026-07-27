import React from 'react';
import {TextInput} from 'react-native';
import {
  act,
  create,
  type ReactTestRenderer,
} from 'react-test-renderer';

const mockSetPayPeriodStartDay = jest.fn();

jest.mock('../src/store/settingsStore', () => ({
  useSettingsStore: () => ({
    usual_start: null,
    setUsualStart: jest.fn(),
    usual_end: null,
    setUsualEnd: jest.fn(),
    prefill_from_usual: false,
    setPrefillFromUsual: jest.fn(),
    weekday_hours: {},
    setWeekdayOverride: jest.fn(),
    pay_period_start_day: 1,
    setPayPeriodStartDay: mockSetPayPeriodStartDay,
  }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'settings.payPeriod': 'Pay period',
      'settings.payPeriodStart': 'Pay period start day',
      'settings.payPeriodHint': '1 → month end',
    }[key] ?? key),
    i18n: {resolvedLanguage: 'en'},
  }),
}));
jest.mock('../src/i18n', () => ({
  getDateFnsLocale: () => jest.requireActual('date-fns/locale').enUS,
}));
jest.mock('../src/theme', () => {
  const actual = jest.requireActual('../src/theme');
  const {lightColors} = jest.requireActual('../src/theme/colors');
  return {...actual, useTheme: () => ({colors: lightColors})};
});
jest.mock('react-native-safe-area-context', () => {
  const {View} = jest.requireActual('react-native');
  return {SafeAreaView: View};
});
jest.mock('../src/components/ui/TimePicker', () => {
  const {View} = jest.requireActual('react-native');
  return View;
});

import WorkDetailsSettings from '../src/screens/settings/WorkDetailsSettings';

beforeEach(() => {
  jest.clearAllMocks();
  mockSetPayPeriodStartDay.mockResolvedValue(undefined);
});

it('saves a valid pay-period start day', async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<WorkDetailsSettings />);
  });
  const input = renderer.root.findByProps({
    accessibilityLabel: 'Pay period start day',
  });

  act(() => input.props.onChangeText('26'));
  await act(async () => input.props.onEndEditing());

  expect(mockSetPayPeriodStartDay).toHaveBeenCalledWith(26);
});

it('does not save a start day outside 1 through 28', async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<WorkDetailsSettings />);
  });
  const input = renderer.root.findByType(TextInput);

  act(() => input.props.onChangeText('29'));
  await act(async () => input.props.onEndEditing());

  expect(mockSetPayPeriodStartDay).not.toHaveBeenCalled();
  expect(renderer.root.findByType(TextInput).props.value).toBe('1');
});
