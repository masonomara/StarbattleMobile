import { createMMKV } from 'react-native-mmkv';
import type { UserSettings, PuzzleProgress } from './types';

const storage = createMMKV();

const KEYS = {
  settings: 'user_settings',
  progress: (puzzleId: string) => `progress:${puzzleId}`,
} as const;

const DEFAULT_SETTINGS: UserSettings = {
  autoX: true,
  highlightErrors: true,
  showTimer: true,
  theme: 'system',
  haptics: true,
};

export function getSettings(): UserSettings {
  const json = storage.getString(KEYS.settings);
  if (!json) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...JSON.parse(json) };
}

export function saveSettings(update: Partial<UserSettings>): void {
  const current = getSettings();
  storage.set(KEYS.settings, JSON.stringify({ ...current, ...update }));
}

export function getProgress(puzzleId: string): PuzzleProgress | null {
  const json = storage.getString(KEYS.progress(puzzleId));
  return json ? JSON.parse(json) : null;
}

export function saveProgress(progress: PuzzleProgress): void {
  storage.set(KEYS.progress(progress.puzzleId), JSON.stringify(progress));
}

export function getPackCompletionCount(
  packId: string,
  puzzleCount: number,
): number {
  let completed = 0;
  for (let i = 0; i < puzzleCount; i++) {
    const p = getProgress(`${packId}:${i}`);
    if (p?.completed) completed++;
  }
  return completed;
}
