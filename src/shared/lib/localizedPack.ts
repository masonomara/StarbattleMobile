import i18n from './i18n';
import type { PackCatalogItem } from '../../types';

// Resolves a pack's user-facing strings for the active language.
//
// The backend ships English in `name`/`type` and Spanish in `name_es`/`type_es`.
// English is the canonical value (it drives streak detection, grouping, and
// sorting); the `_es` columns are display-only. When the app is running in
// Spanish and a translation exists, we show it — otherwise we fall back to the
// English value so a pack without a translation never renders blank.
//
// Callers read these inside render after useTranslation() (or right after a
// catalog load), so i18n.language is current when the value is computed. The app
// only ships 'en' and 'es', and getDeviceLanguage() normalizes regional variants
// to the base tag, so a simple 'es' check is sufficient.
function isSpanish(): boolean {
  return i18n.language?.startsWith('es') ?? false;
}

// The pack's display name in the active language, falling back to English.
export function packDisplayName(
  pack: Pick<PackCatalogItem, 'name' | 'nameEs'>,
): string {
  return isSpanish() && pack.nameEs ? pack.nameEs : pack.name;
}

// The display label for a library bundle section header, in the active language.
// Falls back to the canonical English `type` (and to '' for ungrouped packs).
export function packTypeLabel(
  pack: Pick<PackCatalogItem, 'type' | 'typeEs'>,
): string {
  return isSpanish() && pack.typeEs ? pack.typeEs : pack.type ?? '';
}
