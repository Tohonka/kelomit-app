import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';

// Mutable settings snapshot the mocked store serves; tests flip the mode.
const mockSettings: Record<string, unknown> = {
  loaded: true,
  load: jest.fn(),
  quickadd_default_activity: 'work',
  quickadd_default_tag: '',
  widget_voice_mode: 'confirm',
  widget_voice_auto_title: false,
};

jest.mock('../src/store/settingsStore', () => {
  const useSettingsStore = Object.assign(
    (selector?: (s: unknown) => unknown) =>
      selector ? selector(mockSettings) : mockSettings,
    {getState: () => mockSettings},
  );
  return {useSettingsStore};
});

// Active timer snapshot; tests set `active` to simulate a running session.
const mockSession: {active: {paused_at: string | null} | null} = {active: null};
jest.mock('../src/store/sessionStore', () => ({
  useSessionStore: {getState: () => mockSession},
}));

const mockSaveQuickNote = jest.fn();
jest.mock('../src/components/quickadd/useSaveQuickNote', () => ({
  useSaveQuickNote: () => mockSaveQuickNote,
}));

// Capture AttachmentsSection's props so the test can push a finished
// recording through onAdd, exactly like VoiceRecorder does on stop.
let attachmentsProps: {onAdd: (m: object) => void} | null = null;
jest.mock('../src/components/media/AttachmentsSection', () => {
  const ReactModule = jest.requireActual('react');
  const {View} = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: (props: {onAdd: (m: object) => void}) => {
      attachmentsProps = props;
      return ReactModule.createElement(View);
    },
  };
});

const mockAutoTitle = jest.fn((_arg: unknown) => Promise.resolve());
jest.mock('../src/services/autoTitle', () => ({
  autoTitleVoiceNote: (arg: unknown) => mockAutoTitle(arg),
}));

jest.mock('../src/utils/mediaCapture', () => ({capturePhoto: jest.fn()}));
jest.mock('../src/utils/mediaUtils', () => ({ensureMediaDir: () => Promise.resolve()}));
jest.mock('../src/utils/haptics', () => ({haptic: jest.fn(), HAPTIC_SAVE: 'save'}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));
jest.mock('../src/theme', () => {
  const actual = jest.requireActual('../src/theme');
  const {lightColors} = jest.requireActual('../src/theme/colors');
  return {...actual, useTheme: () => ({colors: lightColors})};
});

import QuickAddModal from '../src/screens/QuickAddModal';

const voiceMedia = {
  media_type: 'voice',
  file_path: '/tmp/rec.wav',
  thumbnail_path: null,
  duration_sec: 5,
};

const renderModal = async (goBack: jest.Mock) => {
  let tree: ReactTestRenderer;
  await act(async () => {
    tree = create(
      React.createElement(QuickAddModal, {
        navigation: {goBack} as never,
        route: {
          key: 'q',
          name: 'QuickAddModal',
          params: {dayId: 1, entryType: 'voice', autoCapture: true},
        } as never,
      }),
    );
  });
  return tree!;
};

beforeEach(() => {
  jest.clearAllMocks();
  attachmentsProps = null;
  mockSession.active = null;
  mockSaveQuickNote.mockResolvedValue({
    entry: {id: 42},
    media: [{id: 7, ...voiceMedia}],
  });
});

describe('widget voice full-auto save', () => {
  it('auto mode: saves, titles and closes when the recording lands', async () => {
    mockSettings.widget_voice_mode = 'auto';
    mockSettings.widget_voice_auto_title = false;
    const goBack = jest.fn();
    await renderModal(goBack);

    await act(async () => {
      attachmentsProps!.onAdd(voiceMedia);
    });

    expect(mockSaveQuickNote).toHaveBeenCalledTimes(1);
    expect(mockSaveQuickNote.mock.calls[0][0].media).toEqual([voiceMedia]);
    // Full-auto always titles, even with the confirm-mode toggle off.
    expect(mockAutoTitle).toHaveBeenCalledTimes(1);
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it('confirm mode: a finished recording does not save by itself', async () => {
    mockSettings.widget_voice_mode = 'confirm';
    const goBack = jest.fn();
    await renderModal(goBack);

    await act(async () => {
      attachmentsProps!.onAdd(voiceMedia);
    });

    expect(mockSaveQuickNote).not.toHaveBeenCalled();
    expect(goBack).not.toHaveBeenCalled();
  });
});

describe('silent capture while a timer runs', () => {
  it('confirm mode + running timer: saves with a placeholder title, no auto-title', async () => {
    mockSettings.widget_voice_mode = 'confirm';
    mockSession.active = {paused_at: null};
    const goBack = jest.fn();
    await renderModal(goBack);

    await act(async () => {
      attachmentsProps!.onAdd(voiceMedia);
    });

    expect(mockSaveQuickNote).toHaveBeenCalledTimes(1);
    expect(mockSaveQuickNote.mock.calls[0][0].title).toBe('subnotes.voiceSaved');
    expect(mockAutoTitle).not.toHaveBeenCalled();
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it('a paused timer is not running: nothing saves by itself', async () => {
    mockSettings.widget_voice_mode = 'confirm';
    mockSession.active = {paused_at: '2026-09-01T09:00:00.000Z'};
    await renderModal(jest.fn());
    await act(async () => {
      attachmentsProps!.onAdd(voiceMedia);
    });
    expect(mockSaveQuickNote).not.toHaveBeenCalled();
  });
});
