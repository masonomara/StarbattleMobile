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
  palette: 'gruvbox',
  haptics: true,
};

export function getSettings(): UserSettings {
  const json = storage.getString(SETTINGS_KEY);
  if (!json) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...JSON.parse(json) };
}

export function saveSettings(update: Partial<UserSettings>): void {
  const current = getSettings();
  storage.set(SETTINGS_KEY, JSON.stringify({ ...current, ...update }));
}
