import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from '@/locales/en.json';
import ja from '@/locales/ja.json';

const resources = {
  en: { translation: en },
  ja: { translation: ja },
} as const;

export type SupportedLanguage = keyof typeof resources;

function detectInitialLanguage(): SupportedLanguage {
  const deviceLocale = getLocales()[0]?.languageCode ?? 'en';
  return deviceLocale === 'ja' ? 'ja' : 'en';
}

void i18n.use(initReactI18next).init({
  resources,
  lng: detectInitialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
