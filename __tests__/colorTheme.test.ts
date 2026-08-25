import {themes, resolveColorTheme, lightColors} from '../src/theme/colors';

it('resolves valid theme names and falls back to default for anything else', () => {
  expect(resolveColorTheme('default')).toBe('default');
  expect(resolveColorTheme('hornet')).toBe('hornet');
  expect(resolveColorTheme('nope')).toBe('default');
  expect(resolveColorTheme(undefined)).toBe('default');
});

it('every theme variant carries the full token set', () => {
  const expected = Object.keys(lightColors).sort();
  for (const [name, variants] of Object.entries(themes)) {
    expect({name, keys: Object.keys(variants.light).sort()}).toEqual({name, keys: expected});
    expect({name, keys: Object.keys(variants.dark).sort()}).toEqual({name, keys: expected});
  }
});

it('opaque tokens are 6-digit hex so callers can append alpha', () => {
  for (const variants of Object.values(themes)) {
    for (const palette of [variants.light, variants.dark]) {
      for (const [token, value] of Object.entries(palette)) {
        if (token.startsWith('glass')) continue; // rgba() by design
        expect({token, value}).toEqual({token, value: expect.stringMatching(/^#[0-9A-Fa-f]{6}$/)});
      }
    }
  }
});
