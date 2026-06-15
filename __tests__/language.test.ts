import {
  detectLanguageFromLocales,
  resolveLanguageSetting,
} from '../src/i18n/language';

describe('language detection', () => {
  it('uses Finnish for Finnish device locale', () => {
    expect(
      detectLanguageFromLocales([{languageCode: 'fi', languageTag: 'fi-FI'}]),
    ).toBe('fi');
  });

  it('uses English for unsupported device locale', () => {
    expect(
      detectLanguageFromLocales([{languageCode: 'sv', languageTag: 'sv-SE'}]),
    ).toBe('en');
  });

  it('lets stored English override device locale', () => {
    expect(
      resolveLanguageSetting('en', [{languageCode: 'fi', languageTag: 'fi-FI'}]),
    ).toBe('en');
  });

  it('lets stored Finnish override device locale', () => {
    expect(
      resolveLanguageSetting('fi', [{languageCode: 'en', languageTag: 'en-US'}]),
    ).toBe('fi');
  });

  it('falls back safely for invalid stored values', () => {
    expect(
      resolveLanguageSetting('xx', [{languageCode: 'fi', languageTag: 'fi-FI'}]),
    ).toBe('fi');
  });
});
