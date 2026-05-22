import { createMMKV } from 'react-native-mmkv';
import type { UserSettings } from './types/state';

const SETTINGS_KEY = 'settings';

let _storage: ReturnType<typeof createMMKV> | null = null;
function getStorage() {
  if (!_storage) _storage = createMMKV({ id: 'starbattle-settings' });
  return _storage;
}

export const DEFAULT_SETTINGS: UserSettings = {
  autoXNeighbors: true,
  autoXRowsCols: false,
  autoXRegions: false,
  highlightErrors: true,
  coloredRegions: false,
  alwaysShowTimer: false,
  alwaysShowToolbar: false,
  theme: 'system',
  haptics: true,
};

export function getSettings(): UserSettings {
  const json = getStorage().getString(SETTINGS_KEY);
  if (!json) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...JSON.parse(json) };
}

export function saveSettings(update: Partial<UserSettings>): void {
  const current = getSettings();
  getStorage().set(SETTINGS_KEY, JSON.stringify({ ...current, ...update }));
}
