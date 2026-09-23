import {darkColors, lightColors} from '../../../src/theme/colors.ts';

/**
 * The phone's palette, verbatim, as CSS custom properties (`--bg`, `--primary`,
 * `--accentAmber`, …). Follows the OS appearance; no theme setting of its own.
 */
export function installTheme(): void {
  const apply = (dark: boolean) => {
    const colors = dark ? darkColors : lightColors;
    const root = document.documentElement;
    for (const [key, value] of Object.entries(colors)) {
      root.style.setProperty(`--${key}`, value);
    }
    root.dataset.theme = dark ? 'dark' : 'light';
  };
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  apply(mq.matches);
  mq.addEventListener('change', e => apply(e.matches));
}
