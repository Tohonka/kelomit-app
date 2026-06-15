import {getLocales} from 'react-native-localize';
import {enUS, fi as fiLocale} from 'date-fns/locale';

export type Language = 'en' | 'fi';

export const SUPPORTED_LANGUAGES: Language[] = ['en', 'fi'];

type LocaleLike = {
  languageCode?: string;
  languageTag?: string;
};

export function isLanguage(value: string | null | undefined): value is Language {
  return value === 'en' || value === 'fi';
}

export function detectLanguageFromLocales(locales: LocaleLike[]): Language {
  const primary = locales[0];
  const code = primary?.languageCode?.toLowerCase();
  const tag = primary?.languageTag?.toLowerCase();
  return code === 'fi' || tag === 'fi' || tag?.startsWith('fi-') ? 'fi' : 'en';
}

export function detectDeviceLanguage(): Language {
  return detectLanguageFromLocales(getLocales());
}

export function resolveLanguageSetting(
  stored: string | null | undefined,
  locales: LocaleLike[] = getLocales(),
): Language {
  return isLanguage(stored) ? stored : detectLanguageFromLocales(locales);
}

export function getDateFnsLocale(language: Language) {
  return language === 'fi' ? fiLocale : enUS;
}
