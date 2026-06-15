import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import en from './locales/en';
import fi from './locales/fi';
import {detectDeviceLanguage} from './language';

export {getDateFnsLocale, resolveLanguageSetting, type Language} from './language';

i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources: {
    en: {translation: en},
    fi: {translation: fi},
  },
  lng: detectDeviceLanguage(),
  fallbackLng: 'en',
  supportedLngs: ['en', 'fi'],
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
