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
// it. Intl (Hermes ships it) is read as a second, independent source rather than
// a mere fallback — see getDeviceLanguage for why both are weighed. We only care
// about the base language tag ("es-419" / "es_US" -> "es"), since regional
// variants share a bundle.
function baseTag(raw: string): string {
  return raw.split(/[-_]/)[0].toLowerCase();
}

function isSupported(base: string): boolean {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(base);
}

function getDeviceLanguage(): string {
  // Gather every locale source we have. On Android the two can disagree:
  // localeIdentifier is Java's Locale.getDefault(), which can lag behind the
  // real UI language (e.g. a stale "en" when the system is Spanish), while
  // Hermes' Intl reads ICU's default and is usually correct. So we don't just
  // take the first non-empty source — a stale "en" there would shadow a correct
  // "es" from Intl, which is exactly the "system is Spanish but app is English"
  // bug. Instead, if ANY source reports a shipped non-English language, prefer
  // it; only fall back to "en" when no source names a language we ship.
  const candidates: string[] = [];
  try {
    const id = I18nManager.getConstants().localeIdentifier;
    if (id) candidates.push(id);
  } catch {}
  try {
    candidates.push(new Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {}

  const bases = candidates.map(baseTag);
  // We only ship en + es, so the only non-default shipped language is es — if
  // either source says es, that's the user's intent.
  const nonDefault = bases.find(b => b !== 'en' && isSupported(b));
  const resolved = nonDefault ?? bases.find(isSupported) ?? 'en';

  if (__DEV__) {
    console.log(
      `[SB:i18n] localeIdentifier+Intl candidates=${JSON.stringify(
        candidates,
      )} -> language=${resolved}`,
    );
  }
  return resolved;
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
