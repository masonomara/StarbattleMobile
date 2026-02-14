import { createMMKV } from 'react-native-mmkv';
import type { UserSettings, Progress, PackProgress } from './types/state';

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
  packProgress: (packId: string) => `${userId}:packProgress:${packId}`,
};

const DEFAULT_SETTINGS: UserSettings = {
  autoXNeighbors: true,
  autoXRowsCols: false,
  autoXRegions: false,
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

export function getPackProgress(packId: string): PackProgress | null {
  const json = storage.getString(KEYS.packProgress(packId));
  return json ? JSON.parse(json) : null;
}

export function savePackProgress(pp: PackProgress): void {
  storage.set(KEYS.packProgress(pp.packId), JSON.stringify(pp));
}

export function computeCompletedCount(
  packId: string,
  puzzleCount: number,
): number {
  let count = 0;
  for (let i = 0; i < puzzleCount; i++) {
    const json = storage.getString(`${userId}:progress:${packId}:${i}`);
    if (json) {
      const p: Progress = JSON.parse(json);
      if (p.completed) count++;
    }
  }
  return count;
}

export function migrateUserData(
  fromUserId: string,
  toUserId: string,
  packIds: string[],
  puzzleCounts: Record<string, number>,
): void {
  const settingsJson = storage.getString(`${fromUserId}:settings`);
  if (settingsJson) {
    storage.set(`${toUserId}:settings`, settingsJson);
  }

  for (const packId of packIds) {
    const count = puzzleCounts[packId] ?? 0;
    for (let i = 0; i < count; i++) {
      const key = `${fromUserId}:progress:${packId}:${i}`;
      const json = storage.getString(key);
      if (json) {
        storage.set(`${toUserId}:progress:${packId}:${i}`, json);
      }
    }

    const packJson = storage.getString(`${fromUserId}:packProgress:${packId}`);
    if (packJson) {
      storage.set(`${toUserId}:packProgress:${packId}`, packJson);
    }
  }
}

export function deleteUserData(
  targetUserId: string,
  packIds: string[],
  puzzleCounts: Record<string, number>,
): void {
  storage.remove(`${targetUserId}:settings`);
  for (const packId of packIds) {
    const count = puzzleCounts[packId] ?? 0;
    for (let i = 0; i < count; i++) {
      storage.remove(`${targetUserId}:progress:${packId}:${i}`);
    }
    storage.remove(`${targetUserId}:packProgress:${packId}`);
  }
}
