import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import en from './locales/en.json';
import es from './locales/es.json';

// Languages the app actually ships strings for. Anything else falls back to 'en'.
export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;

// Read the device language without a native dependency (react-native-localize would
// need a pod install + Android rebuild — avoided so this stays a pure-JS change).
//
// IMPORTANT: under the New Architecture (newArchEnabled=true) TurboModule constants
// are NOT exposed as direct fields on NativeModules.I18nManager — they live behind
// getConstants(). Reading NativeModules.I18nManager.localeIdentifier returns
// undefined there and silently falls back to English. The JS I18nManager wrapper
// from 'react-native' calls getConstants() correctly on both platforms, so we use
// it. Intl is a secondary fallback (Hermes ships it). We only care about the base
// language tag ("es-419" / "es_US" -> "es"), since regional variants share a bundle.
function getDeviceLanguage(): string {
  let raw = '';
  try {
    raw = I18nManager.getConstants().localeIdentifier ?? '';
  } catch {}
  if (!raw) {
    try {
      raw = new Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {}
  }
  const base = raw.split(/[-_]/)[0].toLowerCase();
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(base) ? base : 'en';
}

// init() is synchronous when resources are passed inline, so t() is usable the moment
// this module is imported (see index.js, imported before the App component renders).
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: getDeviceLanguage(),
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
  interpolation: { escapeValue: false }, // React already escapes; double-escaping mangles text
  returnNull: false,
});

export default i18n;
