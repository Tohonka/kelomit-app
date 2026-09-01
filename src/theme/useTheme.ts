import {useMemo} from 'react';
import {useColorScheme} from 'react-native';
import {useSettingsStore} from '../store/settingsStore';
import {themes} from './colors';
import type {Colors} from './colors';

export type ThemeMode = 'system' | 'light' | 'dark';
export type TimeSelectorMode = 'clock' | 'keyboard';

export function useTheme(): {colors: Colors; isDark: boolean} {
  const themeMode = useSettingsStore(s => s.theme_mode);
  const colorTheme = useSettingsStore(s => s.color_theme);
  const systemScheme = useColorScheme();

  const isDark =
    themeMode === 'dark' ||
    (themeMode === 'system' && systemScheme === 'dark');

  const colors = useMemo(
    () => themes[colorTheme][isDark ? 'dark' : 'light'],
    [colorTheme, isDark],
  );

  return {colors, isDark};
}
