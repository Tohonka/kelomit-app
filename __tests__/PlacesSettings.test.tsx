import React from 'react';
import {Alert, Text, TextInput} from 'react-native';
import {act, create, type ReactTestInstance, type ReactTestRenderer} from 'react-test-renderer';

jest.mock('../src/db/routeHistory', () => ({
  getNamedPlaces: jest.fn(),
  renameNamedPlace: jest.fn(),
  deleteNamedPlace: jest.fn(),
  updateNamedPlaceRadius: jest.fn(),
}));
jest.mock('../src/store/locationStore', () => ({
  useLocationStore: jest.fn(),
}));
jest.mock('react-i18next', () => {
  const messages = jest.requireActual('../src/i18n/locales/en').default;
  const translate = (key: string, vars?: Record<string, unknown>) => {
    let value: unknown = messages;
    for (const part of key.split('.')) {
      value = typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)[part]
        : undefined;
    }
    if (typeof value !== 'string') { return key; }
    return value.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
      String(vars?.[name] ?? ''),
    );
  };
  return {useTranslation: () => ({t: translate})};
});
jest.mock('../src/i18n', () => ({
  getDateFnsLocale: () => jest.requireActual('date-fns/locale').enUS,
}));
jest.mock('../src/theme', () => {
  const actual = jest.requireActual('../src/theme');
  const {lightColors} = jest.requireActual('../src/theme/colors');
  return {...actual, useTheme: () => ({colors: lightColors, isDark: false})};
});
jest.mock('react-native-safe-area-context', () => {
  const {View} = jest.requireActual('react-native');
  return {SafeAreaView: View};
});

import {
  getNamedPlaces,
  renameNamedPlace,
  deleteNamedPlace,
  updateNamedPlaceRadius,
} from '../src/db/routeHistory';
import {useLocationStore} from '../src/store/locationStore';
import RadiusEditor from '../src/components/ui/RadiusEditor';
import PlacesSettings from '../src/screens/settings/PlacesSettings';

const getNamedPlacesMock = getNamedPlaces as jest.MockedFunction<typeof getNamedPlaces>;
const useLocationStoreMock = useLocationStore as unknown as jest.Mock;
const alertMock = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const load = jest.fn().mockResolvedValue(undefined);
const remove = jest.fn().mockResolvedValue(undefined);
const setRadius = jest.fn().mockResolvedValue(undefined);
const rename = jest.fn().mockResolvedValue(undefined);

const savedLocation = {
  id: 1,
  name: 'Office',
  kind: 'work' as const,
  latitude: 60.45,
  longitude: 22.27,
  radius_m: 150,
  created_at: '2026-08-01 08:00:00',
  updated_at: '2026-08-01 08:00:00',
};
const namedPlace = {
  id: 7,
  name: 'Warehouse',
  latitude: 60.5,
  longitude: 22.3,
  radius_m: 80,
  created_at: '2026-08-01 08:00:00',
  updated_at: '2026-08-01 08:00:00',
};

async function renderScreen(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<PlacesSettings />);
  });
  return renderer;
}

function texts(root: ReactTestInstance): string[] {
  return root.findAllByType(Text).flatMap(node =>
    node.props.children != null ? [String(node.props.children)] : [],
  );
}

function press(root: ReactTestInstance, testID: string) {
  return root.findByProps({testID}).props.onPress();
}

/** Confirm the last Alert by invoking its destructive button. */
async function confirmAlert() {
  const buttons = alertMock.mock.calls[alertMock.mock.calls.length - 1][2] ?? [];
  await act(async () => {
    buttons.find(b => b.style === 'destructive')!.onPress!();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  getNamedPlacesMock.mockResolvedValue([namedPlace]);
  (renameNamedPlace as jest.Mock).mockResolvedValue(undefined);
  (deleteNamedPlace as jest.Mock).mockResolvedValue(undefined);
  (updateNamedPlaceRadius as jest.Mock).mockResolvedValue(undefined);
  useLocationStoreMock.mockReturnValue({
    locations: [savedLocation],
    load,
    remove,
    setRadius,
    rename,
  });
});

it('renders saved places and named stops', async () => {
  const renderer = await renderScreen();
  const rendered = texts(renderer.root);

  expect(load).toHaveBeenCalled();
  expect(getNamedPlaces).toHaveBeenCalled();
  expect(rendered).toEqual(expect.arrayContaining([
    'Saved places',
    'Named stops',
    'Office',
    'Warehouse',
  ]));
});

it('renames a named place through the edit control', async () => {
  const renderer = await renderScreen();

  act(() => {
    press(renderer.root, 'rename-reusable-7');
  });
  const input = renderer.root.findByType(TextInput);
  expect(input.props.value).toBe('Warehouse');

  act(() => {
    input.props.onChangeText('  Depot  ');
  });
  await act(async () => {
    renderer.root.findByType(TextInput).props.onSubmitEditing();
  });

  expect(renameNamedPlace).toHaveBeenCalledWith(7, 'Depot');
  expect(getNamedPlaces).toHaveBeenCalledTimes(2);
});

it('renames a saved location through the store', async () => {
  const renderer = await renderScreen();

  act(() => {
    press(renderer.root, 'rename-saved-1');
  });
  act(() => {
    renderer.root.findByType(TextInput).props.onChangeText('Studio');
  });
  await act(async () => {
    renderer.root.findByType(TextInput).props.onSubmitEditing();
  });

  expect(rename).toHaveBeenCalledWith(1, 'Studio');
  expect(renameNamedPlace).not.toHaveBeenCalled();
});

it('ignores an empty name', async () => {
  const renderer = await renderScreen();

  act(() => {
    press(renderer.root, 'rename-reusable-7');
  });
  act(() => {
    renderer.root.findByType(TextInput).props.onChangeText('   ');
  });
  await act(async () => {
    renderer.root.findByType(TextInput).props.onSubmitEditing();
  });

  expect(renameNamedPlace).not.toHaveBeenCalled();
  expect(rename).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
});

it('commits once when submit and blur both fire for one edit', async () => {
  const renderer = await renderScreen();

  act(() => {
    press(renderer.root, 'rename-reusable-7');
  });
  act(() => {
    renderer.root.findByType(TextInput).props.onChangeText('Depot');
  });
  const input = renderer.root.findByType(TextInput);
  await act(async () => {
    input.props.onSubmitEditing();
    input.props.onBlur();
  });

  expect(renameNamedPlace).toHaveBeenCalledTimes(1);
});

it('does not write when the name is left unchanged', async () => {
  const renderer = await renderScreen();

  act(() => {
    press(renderer.root, 'rename-saved-1');
  });
  await act(async () => {
    renderer.root.findByType(TextInput).props.onBlur();
  });
  act(() => {
    press(renderer.root, 'rename-reusable-7');
  });
  await act(async () => {
    renderer.root.findByType(TextInput).props.onBlur();
  });

  expect(rename).not.toHaveBeenCalled();
  expect(renameNamedPlace).not.toHaveBeenCalled();
  expect(getNamedPlaces).toHaveBeenCalledTimes(1);
});

it('persists a radius change on a saved location', async () => {
  const renderer = await renderScreen();

  await act(async () => {
    renderer.root.findAllByType(RadiusEditor)[0].props.onChange(200);
  });

  expect(setRadius).toHaveBeenCalledWith(1, 200);
  expect(updateNamedPlaceRadius).not.toHaveBeenCalled();
});

it('persists a radius change on a named place', async () => {
  const renderer = await renderScreen();
  const editors = renderer.root.findAllByType(RadiusEditor);

  expect(editors.map(e => e.props.value)).toEqual([150, 80]);
  await act(async () => {
    editors[1].props.onChange(120);
  });

  expect(updateNamedPlaceRadius).toHaveBeenCalledWith(7, 120);
  expect(setRadius).not.toHaveBeenCalled();
});

it('deletes a named place after confirmation', async () => {
  const renderer = await renderScreen();

  act(() => {
    press(renderer.root, 'delete-reusable-7');
  });
  expect(deleteNamedPlace).not.toHaveBeenCalled();
  await confirmAlert();

  expect(deleteNamedPlace).toHaveBeenCalledWith(7);
  expect(getNamedPlaces).toHaveBeenCalledTimes(2);
});

it('deletes a saved location after confirmation', async () => {
  const renderer = await renderScreen();

  act(() => {
    press(renderer.root, 'delete-saved-1');
  });
  await confirmAlert();

  expect(remove).toHaveBeenCalledWith(1);
});
