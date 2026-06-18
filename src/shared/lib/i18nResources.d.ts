// Makes t() keys compile-time checked and autocompleted against en.json. A typo'd
// or removed key becomes a type error instead of silently rendering the raw key
// string at runtime. en is the reference shape; es is kept in parity by the key
// validator, so typing against en alone is sufficient.
//
// Plurals: react-i18next derives the base key (e.g. "streaks.day") from the
// "_one"/"_other" suffixed entries, so t("streaks.day", { count }) type-checks.
// Dynamic keys stay safe because capitalize() / STREAK_UNIT_KEY return literal
// unions, so the constructed template literal is itself a union of valid keys.
import 'i18next';
import type en from './locales/en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
