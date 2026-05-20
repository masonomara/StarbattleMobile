import { createMMKV } from 'react-native-mmkv';
import type { UserSettings } from './types/state';

const storage = createMMKV({ id: 'starbattle-settings' });
const SETTINGS_KEY = 'settings';

const DEFAULT_SETTINGS: UserSettings = {
  autoXNeighbors: true,
  autoXRowsCols: false,
  autoXRegions: false,
  highlightErrors: true,
  showTimer: true,
  hideToolbar: false,
  theme: 'system',
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
