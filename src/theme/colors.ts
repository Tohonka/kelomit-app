// "Liquid glass" synthwave palette (redesign 2026-07). Converted from the
// prototype's oklch tokens to sRGB. Dark is the primary direction; light is a
// faithful daylight variant. Replaces the old warm-terracotta theme.
//
// Activity categories map to the three accent hues:
//   Work → pink · Personal@work → amber · Personal → cyan
export const lightColors = {
  bg: '#F2F5FB',
  bgCard: '#FAFCFF',
  bgMuted: '#DBDEE5', // card-alt / track
  swatch: '#E7EAF1', // inactive icon circle / chevron swatch
  primary: '#D0268C', // pink accent
  primaryLight: '#E0509F',
  primaryDark: '#A81E70',
  accent: '#B37000', // amber
  accentLight: '#C98A1F',
  accentPink: '#D0268C',
  accentCyan: '#008695',
  accentAmber: '#B37000',
  textPrimary: '#11161F',
  textSecondary: '#505561',
  textMuted: '#6D727B',
  badgeWork: '#D0268C',
  badgePersonalWork: '#B37000',
  badgePersonal: '#008695',
  error: '#C0293A',
  success: '#398526',
  border: '#D0D4DC',
  shadow: '#3A3F4A',
  white: '#FFFFFF',
  // Translucent nav-bar fills (faked "glass" — no blur lib on Android).
  glassTopBar: 'rgba(247,247,244,0.94)',
  glassPill: 'rgba(255,255,255,0.96)',
  glassBorder: 'rgba(0,0,0,0.06)',
  glassHighlight: 'rgba(0,0,0,0.12)', // crisper edge to lift the pill off the bg
  // Live-timer card
  timerBg: '#FBE6F1',
  timerBorder: '#E8A9CE',
};

export const darkColors: Colors = {
  bg: '#090D16',
  bgCard: '#121824',
  bgMuted: '#242933', // card-alt / track
  swatch: '#1D222B', // inactive icon circle / chevron swatch
  primary: '#FB40AD', // pink accent
  primaryLight: '#FF48B3',
  primaryDark: '#C82D8A',
  accent: '#EBA941', // amber
  accentLight: '#F2C069',
  accentPink: '#FB40AD',
  accentCyan: '#1ACFDF',
  accentAmber: '#EBA941',
  textPrimary: '#EEF2F9',
  textSecondary: '#A4ABB8',
  textMuted: '#747A87',
  badgeWork: '#FB40AD',
  badgePersonalWork: '#EBA941',
  badgePersonal: '#1ACFDF',
  error: '#E5484D',
  success: '#5EB749',
  border: '#292E38',
  shadow: '#000000',
  white: '#FFFFFF',
  glassTopBar: 'rgba(22,22,30,0.92)',
  glassPill: 'rgba(30,30,40,0.95)',
  glassBorder: 'rgba(255,255,255,0.14)',
  glassHighlight: 'rgba(255,255,255,0.28)', // crisper edge to lift the pill off the bg
  timerBg: '#331725',
  timerBorder: '#912061',
};

export type Colors = typeof lightColors;
