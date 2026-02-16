import { createMMKV } from 'react-native-mmkv';
import type { UserSettings, Progress } from './types/state';

const storage = createMMKV({ id: 'starbattle' });

const SETTINGS_KEY = 'local:settings';
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

export function computeCompletedCount(
  packId: string,
  puzzleCount: number,
): number {
  let count = 0;
  for (let i = 0; i < puzzleCount; i++) {
    const p = getProgress(`${packId}:${i}`);
    if (p?.completed) count++;
  }
  return count;
}
