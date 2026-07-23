import React from 'react';
import {Alert, TextInput, TouchableOpacity} from 'react-native';
import {act, create, type ReactTestInstance, type ReactTestRenderer} from 'react-test-renderer';

jest.mock('../src/db/settings', () => ({
  getSetting: jest.fn(),
  setSetting: jest.fn(),
}));
jest.mock('../src/services/workReportExport', () => ({
  exportWorkReport: jest.fn(),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'reporting.personName': 'Your name',
      'reporting.companyName': 'Company name',
      'reporting.startDateAccessibility': 'Select start date',
      'reporting.endDateAccessibility': 'Select end date',
      'reporting.languageFiAccessibility': 'Report language Finnish',
      'reporting.languageEnAccessibility': 'Report language English',
      'reporting.typeHoursAccessibility': 'Report type Daily hours',
      'reporting.typeHeadlinesAccessibility': 'Report type Hours and headlines',
      'reporting.typeStatisticsAccessibility': 'Report type Hours and statistics',
      'reporting.export': 'Export PDF',
      'reporting.exporting': 'Exporting…',
      'reporting.errorInvalidRange': 'The start date must be on or before the end date.',
      'common.error': 'Error',
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
  return {
    ...actual,
    useTheme: () => ({colors: lightColors, isDark: false}),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const {View} = jest.requireActual('react-native');
  return {SafeAreaView: View};
});
jest.mock('@react-native-community/datetimepicker', () => {
  const ReactModule = jest.requireActual('react');
  const {View} = jest.requireActual('react-native');
  return function MockDateTimePicker(props: object) {
    return ReactModule.createElement(View, {testID: 'date-picker', ...props});
  };
});

import {getSetting, setSetting} from '../src/db/settings';
import {exportWorkReport} from '../src/services/workReportExport';
import ReportingSettings from '../src/screens/settings/ReportingSettings';

const getSettingMock = getSetting as jest.MockedFunction<typeof getSetting>;
const setSettingMock = setSetting as jest.MockedFunction<typeof setSetting>;
const exportWorkReportMock = exportWorkReport as jest.MockedFunction<typeof exportWorkReport>;
const alertMock = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return {promise, resolve};
}

function button(root: ReactTestInstance, label: string): ReactTestInstance {
  return root.findAllByType(TouchableOpacity).find(
    item => item.props.accessibilityLabel === label,
  )!;
}

async function renderScreen(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ReportingSettings />);
  });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  getSettingMock.mockResolvedValue(null);
  setSettingMock.mockResolvedValue();
  exportWorkReportMock.mockResolvedValue('saved');
});

it('loads two identity fields and exports the selected inclusive date range', async () => {
  const renderer = await renderScreen();
  const root = renderer.root;
  const textInputs = root.findAllByType(TextInput);

  expect(textInputs).toHaveLength(2);
  expect(button(root, 'Export PDF').props.disabled).toBe(true);

  act(() => {
    textInputs[0].props.onChangeText('  Matti Meikäläinen  ');
  });
  await act(async () => {
    textInputs[0].props.onBlur();
  });
  act(() => {
    textInputs[1].props.onChangeText('  Kelo Design Oy  ');
  });
  await act(async () => {
    textInputs[1].props.onBlur();
  });

  await act(async () => {
    button(root, 'Select start date').props.onPress();
  });
  await act(async () => {
    root.findByProps({testID: 'date-picker'}).props.onChange(
      {type: 'set'},
      new Date(2026, 5, 26),
    );
  });
  await act(async () => {
    button(root, 'Select end date').props.onPress();
  });
  await act(async () => {
    root.findByProps({testID: 'date-picker'}).props.onChange(
      {type: 'set'},
      new Date(2026, 6, 25),
    );
  });
  expect(button(root, 'Select start date').props.accessibilityValue).toEqual({
    text: 'Jun 26, 2026',
  });
  expect(button(root, 'Select end date').props.accessibilityValue).toEqual({
    text: 'Jul 25, 2026',
  });
  await act(async () => {
    button(root, 'Export PDF').props.onPress();
  });

  expect(setSetting).toHaveBeenCalledWith(
    'report_person_name',
    'Matti Meikäläinen',
  );
  expect(setSetting).toHaveBeenCalledWith(
    'report_company_name',
    'Kelo Design Oy',
  );
  expect(exportWorkReport).toHaveBeenCalledWith({
    personName: 'Matti Meikäläinen',
    companyName: 'Kelo Design Oy',
    startDate: '2026-06-26',
    endDate: '2026-07-25',
    language: 'fi',
    type: 'hours',
  });
});

it('does not replace identity fields edited before persisted values load', async () => {
  const savedPerson = deferred<string | null>();
  const savedCompany = deferred<string | null>();
  getSettingMock.mockImplementation(key => (
    key === 'report_person_name' ? savedPerson.promise : savedCompany.promise
  ));

  const renderer = await renderScreen();
  const textInputs = renderer.root.findAllByType(TextInput);

  act(() => {
    textInputs[0].props.onChangeText('New person');
    textInputs[1].props.onChangeText('New company');
  });
  await act(async () => {
    savedPerson.resolve('Old person');
    savedCompany.resolve('Old company');
    await Promise.resolve();
  });

  expect(renderer.root.findAllByType(TextInput).map(input => input.props.value))
    .toEqual(['New person', 'New company']);
});

it('disables export and defensively rejects an invalid date range', async () => {
  getSettingMock
    .mockResolvedValueOnce('Matti Meikäläinen')
    .mockResolvedValueOnce('Kelo Design Oy');
  const renderer = await renderScreen();
  const root = renderer.root;

  act(() => {
    button(root, 'Select start date').props.onPress();
  });
  act(() => {
    root.findByProps({testID: 'date-picker'}).props.onChange(
      {type: 'set'},
      new Date(2026, 7, 1),
    );
  });

  expect(button(root, 'Export PDF').props.disabled).toBe(true);
  await act(async () => {
    button(root, 'Export PDF').props.onPress();
  });

  expect(exportWorkReport).not.toHaveBeenCalled();
  expect(alertMock).toHaveBeenCalledWith(
    'Error',
    'The start date must be on or before the end date.',
  );
});

it('exports selected options once and exposes the busy state accessibly', async () => {
  getSettingMock
    .mockResolvedValueOnce('Matti Meikäläinen')
    .mockResolvedValueOnce('Kelo Design Oy');
  const pendingExport = deferred<'saved'>();
  exportWorkReportMock.mockReturnValue(pendingExport.promise);
  const renderer = await renderScreen();
  const root = renderer.root;

  act(() => {
    button(root, 'Report language English').props.onPress();
    button(root, 'Report type Hours and statistics').props.onPress();
  });
  await act(async () => {
    button(root, 'Export PDF').props.onPress();
    await Promise.resolve();
  });

  const exportingButton = button(root, 'Exporting…');
  expect(exportingButton.props.disabled).toBe(true);
  expect(exportingButton.props.accessibilityState).toEqual({
    disabled: true,
    busy: true,
  });
  act(() => {
    exportingButton.props.onPress();
  });
  expect(exportWorkReport).toHaveBeenCalledTimes(1);
  expect(exportWorkReport).toHaveBeenCalledWith(expect.objectContaining({
    language: 'en',
    type: 'statistics',
  }));

  await act(async () => {
    pendingExport.resolve('saved');
    await pendingExport.promise;
  });
});
