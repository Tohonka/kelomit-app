import {useMemo} from 'react';
import {useColorScheme} from 'react-native';
import {useSettingsStore} from '../store/settingsStore';
import {lightColors, darkColors} from './colors';
import type {Colors} from './colors';

export type ThemeMode = 'system' | 'light' | 'dark';

export function useTheme(): {colors: Colors; isDark: boolean} {
  const themeMode = useSettingsStore(s => s.theme_mode);
  const systemScheme = useColorScheme();

  const isDark =
    themeMode === 'dark' ||
    (themeMode === 'system' && systemScheme === 'dark');

  const colors = useMemo(
    () => (isDark ? darkColors : lightColors),
    [isDark],
  );

  return {colors, isDark};
}
