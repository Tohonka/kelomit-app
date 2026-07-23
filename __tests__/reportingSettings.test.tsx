import React from 'react';
import {TextInput, TouchableOpacity} from 'react-native';
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
