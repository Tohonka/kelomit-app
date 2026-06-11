import {create} from 'zustand';
import {getAllSettings, setSetting} from '../db/settings';
import type {Settings, ActivityType} from '../types';

interface SettingsState extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  setGpsEnabled: (enabled: boolean) => Promise<void>;
  setGpsInterval: (ms: number) => Promise<void>;
  setDefaultActivityType: (type: ActivityType) => Promise<void>;
  setDefaultProjectId: (id: number | null) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>(set => ({
  gps_enabled: true,
  gps_interval_ms: 60000,
  default_activity_type: 'work',
  default_project_id: null,
  loaded: false,

  load: async () => {
    const settings = await getAllSettings();
    set({...settings, loaded: true});
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
}));
