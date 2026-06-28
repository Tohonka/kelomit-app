import {create} from 'zustand';
import {getAllSettings, getRawSettings, setSetting} from '../db/settings';
import type {Settings, ActivityType} from '../types';
import type {ThemeMode, TimeSelectorMode} from '../theme';
import i18n, {resolveLanguageSetting, type Language} from '../i18n';
import {DAY_LIST_MODES, type DayListMode} from '../utils/entrySort';

export type NavVisibility = 'always' | 'home_only';

interface SettingsState extends Settings {
  loaded: boolean;
  theme_mode: ThemeMode;
  show_week_numbers: boolean;
  /** Show a second "personal hours" line under the work total in the header. */
  show_personal_hours: boolean;
  nav_visibility: NavVisibility;
  /** Day-list ordering/grouping mode (Home + Day), cycled via the sort pill. */
  day_list_mode: DayListMode;
  /** Opt-in: keep logging GPS via a foreground service while the app is closed. */
  background_tracking: boolean;
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
  setShowPersonalHours: (show: boolean) => Promise<void>;
  setNavVisibility: (mode: NavVisibility) => Promise<void>;
  setDayListMode: (mode: DayListMode) => Promise<void>;
  setBackgroundTracking: (enabled: boolean) => Promise<void>;
  setUsualStart: (hhmm: string | null) => Promise<void>;
  setUsualEnd: (hhmm: string | null) => Promise<void>;
  setPrefillFromUsual: (enabled: boolean) => Promise<void>;
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
  usual_start: null,
  usual_end: null,
  prefill_from_usual: false,
  theme_mode: 'system',
  show_week_numbers: false,
  show_personal_hours: false,
  nav_visibility: 'always',
  day_list_mode: 'time_desc',
  background_tracking: false,
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
    const show_personal_hours = raw.show_personal_hours === 'true';
    const nav_visibility: NavVisibility =
      raw.nav_visibility === 'home_only' ? 'home_only' : 'always';
    const day_list_mode: DayListMode = DAY_LIST_MODES.includes(
      raw.day_list_mode as DayListMode,
    )
      ? (raw.day_list_mode as DayListMode)
      : 'time_desc';
    const background_tracking = raw.background_tracking === 'true';
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
      show_personal_hours,
      nav_visibility,
      day_list_mode,
      background_tracking,
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

  setShowPersonalHours: async show => {
    await setSetting('show_personal_hours', String(show));
    set({show_personal_hours: show});
  },

  setNavVisibility: async mode => {
    await setSetting('nav_visibility', mode);
    set({nav_visibility: mode});
  },

  setDayListMode: async mode => {
    await setSetting('day_list_mode', mode);
    set({day_list_mode: mode});
  },

  setBackgroundTracking: async enabled => {
    await setSetting('background_tracking', String(enabled));
    set({background_tracking: enabled});
  },

  setUsualStart: async hhmm => {
    await setSetting('usual_start', hhmm ?? '');
    set({usual_start: hhmm});
  },

  setUsualEnd: async hhmm => {
    await setSetting('usual_end', hhmm ?? '');
    set({usual_end: hhmm});
  },

  setPrefillFromUsual: async enabled => {
    await setSetting('prefill_from_usual', String(enabled));
    set({prefill_from_usual: enabled});
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
