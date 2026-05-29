// NOTE: rgba() is used throughout the app (PuzzleCanvas, PuzzleThumbnail,
// PaywallModal, SettingsModal). It only handles 6-digit hex; shorthand (#rgb)
// and 8-digit hex (#rrggbbaa) will produce NaN silently. All theme colors are
// 6-digit, so this is safe today. Add a guard if the palette ever adopts
// shorthand notation.
export const rgba = (hex: string, a: number): string => {
  const h = hex.replace('#', '').slice(0, 6);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};
