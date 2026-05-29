import { settingsStorage as storage } from './mmkv';
import type { UserSettings } from './types';

const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS: UserSettings = {
  autoXNeighbors: true,
  autoXRowsCols: false,
  autoXRegions: false,
  highlightErrors: true,
  coloredRegions: false,
  alwaysShowTimer: false,
  alwaysShowToolbar: false,
  theme: 'system',
  palette: 'original',
  haptics: true,
};

export function getSettings(): UserSettings {
  const json = storage.getString(SETTINGS_KEY);
  if (!json) return DEFAULT_SETTINGS;
  try {
    // Spread over DEFAULT_SETTINGS so any new keys added later get their
    // default values even when the stored JSON predates them.
    return { ...DEFAULT_SETTINGS, ...JSON.parse(json) };
  } catch {
    // Corrupt MMKV value — start fresh rather than crashing.
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(update: Partial<UserSettings>): void {
  const current = getSettings();
  storage.set(SETTINGS_KEY, JSON.stringify({ ...current, ...update }));
}
