/**
 * The desktop's own palette — quiet warm-neutral surfaces, one teal accent —
 * exposed as CSS custom properties (`--bg`, `--primary`, `--work`, …). It is
 * deliberately not the phone's synthwave theme: a desk-side companion reads
 * better calm. Follows the OS appearance; no theme setting of its own.
 *
 * Activity trio (work / personal at work / personal) validated with the
 * dataviz palette checker for CVD separation on both surfaces.
 */
const light = {
  bg: '#F5F5F3',
  bgCard: '#FFFFFF',
  bgMuted: '#E9E9E5',
  swatch: '#EFEFEC',
  border: '#E1E1DC',
  borderStrong: '#C9C9C3',
  textPrimary: '#1C1C1A',
  textSecondary: '#5F5F5A',
  textMuted: '#7A7A74',
  primary: '#0F8F7E',
  onPrimary: '#FFFFFF',
  work: '#0F8F7E',
  personalWork: '#C2731A',
  personal: '#6D5BAA',
  error: '#C43D3D',
  success: '#3A8A3A',
  white: '#FFFFFF',
};

const dark: typeof light = {
  bg: '#161719',
  bgCard: '#1E1F22',
  bgMuted: '#2A2B2F',
  swatch: '#252629',
  border: '#2F3034',
  borderStrong: '#45464B',
  textPrimary: '#ECECE9',
  textSecondary: '#A3A39F',
  textMuted: '#7C7C77',
  primary: '#26AB9A',
  onPrimary: '#10201D',
  work: '#26AB9A',
  personalWork: '#C47F2E',
  personal: '#9580DC',
  error: '#E0565B',
  success: '#5DB85C',
  white: '#FFFFFF',
};

export function installTheme(): void {
  const apply = (isDark: boolean) => {
    const colors = isDark ? dark : light;
    const root = document.documentElement;
    for (const [key, value] of Object.entries(colors)) {
      root.style.setProperty(`--${key}`, value);
    }
    root.dataset.theme = isDark ? 'dark' : 'light';
  };
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  apply(mq.matches);
  mq.addEventListener('change', e => apply(e.matches));
}
