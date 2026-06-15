export {lightColors, darkColors, lightColors as colors} from './colors';
export type {Colors} from './colors';
export {useTheme} from './useTheme';
export type {ThemeMode, TimeSelectorMode} from './useTheme';

export const typography = {
  fontFamily: 'System',
  sizes: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 100,
};
