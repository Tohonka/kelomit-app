import {create} from 'zustand';
import {getAllSettings, getRawSettings, setSetting} from '../db/settings';
import type {Settings, ActivityType} from '../types';
import type {ThemeMode, TimeSelectorMode} from '../theme';
import i18n, {resolveLanguageSetting, type Language} from '../i18n';

interface SettingsState extends Settings {
  loaded: boolean;
  theme_mode: ThemeMode;
  show_week_numbers: boolean;
  time_selector_mode: TimeSelectorMode;
  language: Language;
  quickadd_default_project_id: number | null;
  quickadd_default_tag: string;
  quickadd_default_activity: ActivityType;
  load: () => Promise<void>;
  setGpsEnabled: (enabled: boolean) => Promise<void>;
  setGpsInterval: (ms: number) => Promise<void>;
  setDefaultActivityType: (type: ActivityType) => Promise<void>;
  setDefaultProjectId: (id: number | null) => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setShowWeekNumbers: (show: boolean) => Promise<void>;
  setTimeSelectorMode: (mode: TimeSelectorMode) => Promise<void>;
  setLanguage: (language: Language) => Promise<void>;
  setQuickAddDefaultProjectId: (id: number | null) => Promise<void>;
  setQuickAddDefaultTag: (tag: string) => Promise<void>;
  setQuickAddDefaultActivity: (type: ActivityType) => Promise<void>;
}

const ACTIVITY_TYPES: ActivityType[] = ['work', 'personal_work', 'personal'];

export const useSettingsStore = create<SettingsState>(set => ({
  gps_enabled: true,
  gps_interval_ms: 60000,
  default_activity_type: 'work',
  default_project_id: null,
  theme_mode: 'system',
  show_week_numbers: false,
  time_selector_mode: 'clock',
  language: 'en',
  quickadd_default_project_id: null,
  quickadd_default_tag: 'Quick add',
  quickadd_default_activity: 'work',
  loaded: false,

  load: async () => {
    const settings = await getAllSettings();
    const raw = await getRawSettings();
    const theme_mode: ThemeMode =
      raw.theme_mode === 'light' || raw.theme_mode === 'dark'
        ? raw.theme_mode
        : 'system';
    const show_week_numbers = raw.show_week_numbers === 'true';
    const time_selector_mode: TimeSelectorMode =
      raw.time_selector_mode === 'keyboard' ? 'keyboard' : 'clock';
    const language = resolveLanguageSetting(raw.language);
    await i18n.changeLanguage(language);
    const quickadd_default_project_id = raw.quickadd_default_project_id
      ? parseInt(raw.quickadd_default_project_id, 10)
      : null;
    const quickadd_default_tag = raw.quickadd_default_tag ?? 'Quick add';
    const quickadd_default_activity: ActivityType = ACTIVITY_TYPES.includes(
      raw.quickadd_default_activity as ActivityType,
    )
      ? (raw.quickadd_default_activity as ActivityType)
      : 'work';
    set({
      ...settings,
      theme_mode,
      show_week_numbers,
      time_selector_mode,
      language,
      quickadd_default_project_id,
      quickadd_default_tag,
      quickadd_default_activity,
      loaded: true,
    });
  },

  setGpsEnabled: async enabled => {
    await setSetting('gps_enabled', String(enabled));
    set({gps_enabled: enabled});
  },

  setGpsInterval: async ms => {
    await setSetting('gps_interval_ms', String(ms));
    set({gps_interval_ms: ms});
  },

  setDefaultActivityType: async type => {
    await setSetting('default_activity_type', type);
    set({default_activity_type: type});
  },

  setDefaultProjectId: async id => {
    await setSetting('default_project_id', id == null ? '' : String(id));
    set({default_project_id: id});
  },

  setThemeMode: async mode => {
    await setSetting('theme_mode', mode);
    set({theme_mode: mode});
  },

  setShowWeekNumbers: async show => {
    await setSetting('show_week_numbers', String(show));
    set({show_week_numbers: show});
  },

  setTimeSelectorMode: async mode => {
    await setSetting('time_selector_mode', mode);
    set({time_selector_mode: mode});
  },

  setLanguage: async language => {
    await setSetting('language', language);
    await i18n.changeLanguage(language);
    set({language});
  },

  setQuickAddDefaultProjectId: async id => {
    await setSetting('quickadd_default_project_id', id == null ? '' : String(id));
    set({quickadd_default_project_id: id});
  },

  setQuickAddDefaultTag: async tag => {
    await setSetting('quickadd_default_tag', tag);
    set({quickadd_default_tag: tag});
  },

  setQuickAddDefaultActivity: async type => {
    await setSetting('quickadd_default_activity', type);
    set({quickadd_default_activity: type});
  },
}));
