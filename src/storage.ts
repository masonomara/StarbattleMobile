import { createMMKV } from 'react-native-mmkv';
import type { UserSettings, Progress } from './types/state';

const storage = createMMKV({ id: 'starbattle' });

const KEYS = {
  settings: () => 'local:settings',
  progress: (puzzleId: string) => `local:progress:${puzzleId}`,
};

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
  if (progress.completedAt === undefined) {
    const existing = getProgress(progress.puzzleId);
    if (existing?.completedAt) {
      progress = { ...progress, completedAt: existing.completedAt };
    }
  }
  storage.set(KEYS.progress(progress.puzzleId), JSON.stringify(progress));
}

export function computeCompletedCount(
  packId: string,
  puzzleCount: number,
): number {
  let count = 0;
  for (let i = 0; i < puzzleCount; i++) {
    const json = storage.getString(`local:progress:${packId}:${i}`);
    if (json) {
      const p: Progress = JSON.parse(json);
      if (p.completed) count++;
    }
  }
  return count;
}
