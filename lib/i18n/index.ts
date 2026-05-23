/* eslint-disable import/no-named-as-default-member --
   i18next's default export is the i18n instance; calling instance methods
   (use, init, changeLanguage) on it is the intended API. */
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const LANGUAGE_KEY = 'german-vocab-app:language';

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

/**
 * Switch the app language and remember the choice. The whole app re-renders
 * because every screen reads strings through `useTranslation`.
 */
export async function setLanguage(lang: SupportedLanguage): Promise<void> {
  await i18n.changeLanguage(lang);
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  } catch {
    // Persisting the preference is best-effort; the switch itself still applies.
  }
}

/**
 * Apply a previously saved language preference. Call once at startup; if no
 * preference is stored the device-locale default from init() stays in effect.
 */
export async function loadSavedLanguage(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
    if ((saved === 'ja' || saved === 'en') && saved !== i18n.language) {
      await i18n.changeLanguage(saved);
    }
  } catch {
    // Ignore and keep the device-locale default.
  }
}

export default i18n;
