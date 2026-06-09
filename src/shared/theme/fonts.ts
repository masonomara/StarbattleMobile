import type { TextRole } from '../../types';

// Custom font families bundled in assets/fonts/ and linked into the native
// projects via `npx react-native-asset` (driven by react-native.config.js).
//
// React Native resolves `fontFamily` by the font's PostScript name on both
// platforms (Android uses the file name, which matches here). Because each
// weight is a distinct file/face, set the family per weight and do NOT also
// set `fontWeight` — that can make a platform synthesize or mis-pick a face.
// The Text wrapper does this mapping automatically for the base font.

// A family is one face per UI weight. Each value is the exact fontFamily string.
export type FontFamily = {
  regular: string;
  medium: string;
  semibold: string;
  bold: string;
};

const family = (base: string): FontFamily => ({
  regular: `${base}-Regular`,
  medium: `${base}-Medium`,
  semibold: `${base}-SemiBold`,
  bold: `${base}-Bold`,
});

// Every bundled sans family (each shipped as 4 static weights, 400/500/600/700).
// Only the families actually used in the pairing below are bundled in
// assets/fonts/. To try another typeface, add its 4 weight files there and a
// line here, then point displayFont/baseFont at it.
export const Fonts = {
  bricolage: family('BricolageGrotesque'),
  karla: family('Karla'),
} as const;

// ─── Type pairing ────────────────────────────────────────────────────────────
// The app pairs a characterful display face for the big titles with a clean,
// legible sans for everything else. Change either line (then reload) to try a
// different pairing — any value from `Fonts` above works for either slot.
//
//   display — used for the roles in DISPLAY_ROLES (headings/branding)
//   base    — used for every other role and all un-roled text (body/UI)
//
// Current pairing: Bricolage Grotesque titles + Karla body.
export const displayFont: FontFamily = Fonts.bricolage;
export const baseFont: FontFamily = Fonts.karla;

// Roles that render in the display font. Everything else uses the base font.
// Tune this set to push more/fewer headings onto the display face.
export const DISPLAY_ROLES: ReadonlySet<TextRole> = new Set<TextRole>([
  'largeTitle',
  'title1',
  'title2',
]);
