import React from 'react';
import {Alert, TextInput, TouchableOpacity} from 'react-native';
import {act, create, type ReactTestInstance, type ReactTestRenderer} from 'react-test-renderer';

let mockUiLanguage = 'en';

jest.mock('../src/db/settings', () => ({
  getSetting: jest.fn(),
  setSetting: jest.fn(),
}));
jest.mock('../src/services/workReportExport', () => ({
  exportWorkReport: jest.fn(),
}));
jest.mock('react-i18next', () => {
  const messages: Record<string, Record<string, unknown>> = {
    en: jest.requireActual('../src/i18n/locales/en').default,
    fi: jest.requireActual('../src/i18n/locales/fi').default,
  };
  const translate = (language: string, key: string) => {
    let value: unknown = messages[language];
    for (const part of key.split('.')) {
      value = typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)[part]
        : undefined;
    }
    return typeof value === 'string' ? value : key;
  };
  const translators: Record<string, (key: string) => string> = {
    en: key => translate('en', key),
    fi: key => translate('fi', key),
  };
  return {
    useTranslation: () => ({
      t: translators[mockUiLanguage],
      i18n: {
        resolvedLanguage: mockUiLanguage,
        getFixedT: (language: string) => translators[language],
      },
    }),
  };
});
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
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return {promise, resolve, reject};
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
  mockUiLanguage = 'en';
  getSettingMock.mockResolvedValue(null);
  setSettingMock.mockResolvedValue();
  exportWorkReportMock.mockResolvedValue();
});

it('defaults dates to the most recently completed saved pay period', async () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 6, 27, 12));
  getSettingMock.mockImplementation(async key => {
    if (key === 'report_person_name') { return 'Matti Meikäläinen'; }
    if (key === 'report_company_name') { return 'Kelo Design Oy'; }
    if (key === 'pay_period_start_day') { return '26'; }
    return null;
  });

  const renderer = await renderScreen();

  expect(
    button(renderer.root, 'Select start date').props.accessibilityValue,
  ).toEqual({text: 'Jun 26, 2026'});
  expect(
    button(renderer.root, 'Select end date').props.accessibilityValue,
  ).toEqual({text: 'Jul 25, 2026'});
  jest.useRealTimers();
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
    'Virhe',
    'Alkupäivän tulee olla sama tai ennen loppupäivää.',
  );
});

it('exports selected options once and exposes the busy state accessibly', async () => {
  getSettingMock
    .mockResolvedValueOnce('Matti Meikäläinen')
    .mockResolvedValueOnce('Kelo Design Oy');
  const pendingExport = deferred<void>();
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
    pendingExport.resolve();
    await pendingExport.promise;
  });
});

it('shows Finnish report errors under an English UI', async () => {
  getSettingMock
    .mockResolvedValueOnce('Matti Meikäläinen')
    .mockResolvedValueOnce('Kelo Design Oy');
  exportWorkReportMock.mockRejectedValue(new Error('report_read_failed'));
  const renderer = await renderScreen();

  await act(async () => {
    button(renderer.root, 'Export PDF').props.onPress();
  });

  expect(alertMock).toHaveBeenCalledWith(
    'Virhe',
    'Raportin tietoja ei voitu lukea.',
  );
});

it('shows English report errors under a Finnish UI', async () => {
  mockUiLanguage = 'fi';
  getSettingMock
    .mockResolvedValueOnce('Matti Meikäläinen')
    .mockResolvedValueOnce('Kelo Design Oy');
  exportWorkReportMock.mockRejectedValue(new Error('report_save_failed'));
  const renderer = await renderScreen();

  act(() => {
    button(renderer.root, 'Raportin kieli englanti').props.onPress();
  });
  await act(async () => {
    button(renderer.root, 'Vie PDF').props.onPress();
  });

  expect(alertMock).toHaveBeenCalledWith(
    'Error',
    'The report could not be saved.',
  );
});

it('shows a localized identity load failure', async () => {
  getSettingMock.mockRejectedValue(new Error('SQLite unavailable'));

  await renderScreen();

  expect(alertMock).toHaveBeenCalledWith(
    'Error',
    'The saved report details could not be loaded.',
  );
});

it('shows a localized identity save failure without trimming the field', async () => {
  setSettingMock.mockRejectedValue(new Error('SQLite unavailable'));
  const renderer = await renderScreen();
  const personInput = renderer.root.findAllByType(TextInput)[0];

  act(() => {
    personInput.props.onChangeText('  New person  ');
  });
  await act(async () => {
    await personInput.props.onBlur();
  });

  expect(renderer.root.findAllByType(TextInput)[0].props.value)
    .toBe('  New person  ');
  expect(alertMock).toHaveBeenCalledWith(
    'Error',
    'The report details could not be saved.',
  );
});

it('does not overwrite newer input when an earlier identity save finishes', async () => {
  const pendingSave = deferred<void>();
  setSettingMock.mockReturnValue(pendingSave.promise);
  const renderer = await renderScreen();
  const personInput = renderer.root.findAllByType(TextInput)[0];

  act(() => {
    personInput.props.onChangeText('  Earlier person  ');
  });
  const savePromise = personInput.props.onBlur();
  act(() => {
    renderer.root.findAllByType(TextInput)[0].props.onChangeText('Newer person');
  });
  await act(async () => {
    pendingSave.resolve();
    await savePromise;
  });

  expect(setSetting).toHaveBeenCalledWith(
    'report_person_name',
    'Earlier person',
  );
  expect(renderer.root.findAllByType(TextInput)[0].props.value)
    .toBe('Newer person');
});

it('does not update or alert after an identity save finishes post-unmount', async () => {
  const pendingSave = deferred<void>();
  setSettingMock.mockReturnValue(pendingSave.promise);
  const renderer = await renderScreen();
  const personInput = renderer.root.findAllByType(TextInput)[0];

  act(() => {
    personInput.props.onChangeText('New person');
  });
  let savePromise!: Promise<void>;
  act(() => {
    savePromise = personInput.props.onBlur();
    renderer.unmount();
  });

  pendingSave.reject(new Error('SQLite unavailable'));
  await expect(savePromise).resolves.toBeUndefined();
  expect(alertMock).not.toHaveBeenCalled();
});

it('does not alert when identity loading fails after unmount', async () => {
  const pendingLoad = deferred<string | null>();
  getSettingMock.mockReturnValue(pendingLoad.promise);
  const renderer = await renderScreen();

  act(() => {
    renderer.unmount();
  });
  const ignoredRejection = pendingLoad.promise.catch(() => undefined);
  pendingLoad.reject(new Error('SQLite unavailable'));
  await ignoredRejection;
  await Promise.resolve();

  expect(alertMock).not.toHaveBeenCalled();
});

it('never exposes an unexpected technical export error', async () => {
  getSettingMock
    .mockResolvedValueOnce('Matti Meikäläinen')
    .mockResolvedValueOnce('Kelo Design Oy');
  exportWorkReportMock.mockRejectedValue(new Error('SQLite password leaked'));
  const renderer = await renderScreen();

  await act(async () => {
    button(renderer.root, 'Export PDF').props.onPress();
  });

  expect(alertMock).toHaveBeenCalledWith('Virhe', 'Vienti epäonnistui');
  expect(alertMock).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.stringContaining('SQLite'),
  );
});
