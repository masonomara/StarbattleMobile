import { createMMKV } from 'react-native-mmkv';
import type { UserSettings, Progress, Streak } from './types/state';

const storage = createMMKV({ id: 'starbattle' });

const SETTINGS_KEY = 'local:settings';
const STREAKS_KEY = 'local:streaks';
const progressKey = (puzzleId: string) => `local:progress:${puzzleId}`;

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

export function getProgress(puzzleId: string): Progress | null {
  const json = storage.getString(progressKey(puzzleId));
  return json ? JSON.parse(json) : null;
}

export function saveProgress(progress: Progress): void {
  const existing = getProgress(progress.puzzleId);
  const merged = existing ? { ...existing, ...progress } : progress;
  storage.set(progressKey(merged.puzzleId), JSON.stringify(merged));
}

const defaultStreaks: Streak[] = [
  { type: 'daily', current: 0, lastCompletedKey: '' },
  { type: 'weekly', current: 0, lastCompletedKey: '' },
  { type: 'monthly', current: 0, lastCompletedKey: '' },
];

export function getStreaks(): Streak[] {
  const json = storage.getString(STREAKS_KEY);
  if (!json) return defaultStreaks;
  return JSON.parse(json) as Streak[];
}

export function saveStreak(streak: Streak): void {
  const current = getStreaks();
  const updated = current.map(s => s.type === streak.type ? streak : s);
  storage.set(STREAKS_KEY, JSON.stringify(updated));
}

