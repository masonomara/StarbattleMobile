import { createMMKV } from 'react-native-mmkv';
import type { UserSettings, Progress } from './types/state';

const storage = createMMKV({ id: 'starbattle' });

let userId = 'local';

export function setUserId(id: string) {
  userId = id;
}

export function getUserId(): string {
  return userId;
}

const KEYS = {
  settings: () => `${userId}:settings`,
  progress: (puzzleId: string) => `${userId}:progress:${puzzleId}`,
};

const DEFAULT_SETTINGS: UserSettings = {
  autoXNeighbors: true,
  autoXRowsCols: false,
  highlightErrors: true,
  showTimer: true,
  theme: 'system',
  haptics: true,
};

export function getSettings(): UserSettings {
  const json = storage.getString(KEYS.settings());
  if (!json) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...JSON.parse(json) };
}

export function saveSettings(update: Partial<UserSettings>): void {
  const current = getSettings();
  storage.set(KEYS.settings(), JSON.stringify({ ...current, ...update }));
}

export function getProgress(puzzleId: string): Progress | null {
  const json = storage.getString(KEYS.progress(puzzleId));
  return json ? JSON.parse(json) : null;
}

export function saveProgress(progress: Progress): void {
  storage.set(KEYS.progress(progress.puzzleId), JSON.stringify(progress));
}

export function getCompletedCount(packId: string, puzzleCount: number): number {
  let count = 0;
  for (let i = 0; i < puzzleCount; i++) {
    const progress = getProgress(`${packId}:${i}`);
    if (progress?.completed) count++;
  }
  return count;
}
