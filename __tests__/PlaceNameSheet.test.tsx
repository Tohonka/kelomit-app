import React from 'react';
import {Text, TextInput, TouchableOpacity} from 'react-native';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';

jest.mock('react-i18next', () => {
  const messages = jest.requireActual('../src/i18n/locales/en').default;
  const translate = (key: string, values?: Record<string, unknown>) => {
    let value: unknown = messages;
    for (const part of key.split('.')) {
      value =
        typeof value === 'object' && value !== null
          ? (value as Record<string, unknown>)[part]
          : undefined;
    }
    if (typeof value !== 'string') {
      return key;
    }
    return Object.entries(values ?? {}).reduce(
      (result, [name, replacement]) =>
        result.replace(`{{${name}}}`, String(replacement)),
      value,
    );
  };
  return {
    initReactI18next: {type: '3rdParty', init: jest.fn()},
    useTranslation: () => ({t: translate}),
  };
});
jest.mock('../src/theme', () => {
  const actual = jest.requireActual('../src/theme');
  const {lightColors} = jest.requireActual('../src/theme/colors');
  return {...actual, useTheme: () => ({colors: lightColors, isDark: false})};
});

import PlaceNameSheet from '../src/components/map/PlaceNameSheet';

const localChoices = [
  {type: 'saved' as const, id: 1, name: 'Workshop', distanceM: 12},
  {type: 'reusable' as const, id: 2, name: 'Coffee spot', distanceM: 24},
];
const googleCandidates = [
  {
    placeId: 'google-1',
    name: 'Google Cafe',
    latitude: 60.17,
    longitude: 24.94,
    distanceM: 31,
  },
];

function button(root: ReactTestInstance, label: string): ReactTestInstance {
  return root.findAllByType(TouchableOpacity).find(
    item => item.props.accessibilityLabel === label,
  )!;
}

function visibleText(root: ReactTestInstance): string[] {
  const flatten = (value: unknown): string =>
    Array.isArray(value)
      ? value.map(flatten).join('')
      : typeof value === 'string'
        ? value
        : '';
  return root.findAllByType(Text).map(node => flatten(node.props.children));
}

function renderSheet(
  props: Partial<React.ComponentProps<typeof PlaceNameSheet>> = {},
): {
  renderer: ReactTestRenderer;
  onChoose: jest.Mock;
  onCreateName: jest.Mock;
  onClose: jest.Mock;
} {
  const onChoose = jest.fn();
  const onCreateName = jest.fn();
  const onClose = jest.fn();
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <PlaceNameSheet
        visible
        currentName="Historical label"
        localChoices={localChoices}
        googleCandidates={googleCandidates}
        googleLoading={false}
        googleError={false}
        onChoose={onChoose}
        onCreateName={onCreateName}
        onClose={onClose}
        {...props}
      />,
    );
  });
  return {renderer, onChoose, onCreateName, onClose};
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return {promise, resolve, reject};
}

it('shows local choices before Google candidates with visible type and distance', () => {
  const {renderer} = renderSheet();
  const text = visibleText(renderer.root);

  expect(text.indexOf('Workshop')).toBeLessThan(text.indexOf('Google Cafe'));
  expect(text).toEqual(
    expect.arrayContaining([
      'Saved place · 12 m away',
      'Reusable place · 24 m away',
      'Google · 31 m away',
    ]),
  );
});

it('awaits a successful place choice and closes the sheet', async () => {
  const {renderer, onChoose, onClose} = renderSheet();
  onChoose.mockResolvedValue(undefined);

  await act(async () => {
    button(renderer.root, 'Choose place Workshop, Saved place, 12 m away').props.onPress();
    await Promise.resolve();
  });

  expect(onChoose).toHaveBeenCalledTimes(1);
  expect(onChoose).toHaveBeenCalledWith(localChoices[0]);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('opens custom naming and keeps Save disabled for whitespace', () => {
  const {renderer, onCreateName} = renderSheet();

  act(() => {
    button(renderer.root, 'Name this place…').props.onPress();
  });
  const input = renderer.root.findByType(TextInput);
  act(() => {
    input.props.onChangeText('   ');
  });

  const save = button(renderer.root, 'Save');
  expect(save.props.disabled).toBe(true);
  act(() => {
    save.props.onPress();
  });
  expect(onCreateName).not.toHaveBeenCalled();
});

it('creates a reusable name with trimmed text and closes after success', async () => {
  const {renderer, onCreateName, onClose} = renderSheet();
  onCreateName.mockResolvedValue(undefined);

  act(() => {
    button(renderer.root, 'Name this place…').props.onPress();
  });
  act(() => {
    renderer.root.findByType(TextInput).props.onChangeText('  New anchor  ');
  });
  await act(async () => {
    button(renderer.root, 'Save').props.onPress();
    await Promise.resolve();
  });

  expect(onCreateName).toHaveBeenCalledTimes(1);
  expect(onCreateName).toHaveBeenCalledWith('New anchor');
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('keeps the sheet open and shows a localized error when persistence rejects', async () => {
  const {renderer, onChoose, onClose} = renderSheet();
  onChoose.mockRejectedValue(new Error('database unavailable'));

  await act(async () => {
    button(renderer.root, 'Choose place Workshop, Saved place, 12 m away').props.onPress();
    await Promise.resolve();
  });

  expect(onClose).not.toHaveBeenCalled();
  expect(visibleText(renderer.root)).toContain('Could not save place name.');
  expect(
    button(renderer.root, 'Choose place Workshop, Saved place, 12 m away').props
      .disabled,
  ).toBe(false);
});

it('prevents duplicate submits while a place choice is saving', async () => {
  const pending = deferred<void>();
  const {renderer, onChoose, onClose} = renderSheet();
  onChoose.mockReturnValue(pending.promise);
  const label = 'Choose place Workshop, Saved place, 12 m away';

  act(() => {
    button(renderer.root, label).props.onPress();
  });
  expect(button(renderer.root, label).props.disabled).toBe(true);
  act(() => {
    button(renderer.root, label).props.onPress();
  });
  expect(onChoose).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();

  await act(async () => {
    pending.resolve();
    await pending.promise;
  });
  expect(onClose).toHaveBeenCalledTimes(1);
});

it.each([
  {googleLoading: true, googleError: false, status: 'Loading places…'},
  {googleLoading: false, googleError: true, status: 'Could not load places.'},
])(
  'keeps local choices, historical name, and naming available while $status',
  state => {
    const {renderer} = renderSheet({
      ...state,
      googleCandidates: [],
    });
    const text = visibleText(renderer.root);

    expect(text).toEqual(
      expect.arrayContaining([
        'Historical label',
        'Workshop',
        state.status,
      ]),
    );
    expect(button(renderer.root, 'Name this place…')).toBeDefined();
  },
);
