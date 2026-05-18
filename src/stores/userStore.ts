import { create } from 'zustand';
import {
  getSettings,
  saveSettings,
  saveProgress as storageSaveProgress,
  getProgress,
  getStreaks,
  saveStreak,
} from '../storage';
import { packs } from '../packs';
import type {
  UserSettings,
  Progress,
  Streak,
  StreakType,
} from '../types/state';
import { getCurrentKey, getPreviousKey } from '../utils/streakDate';

type ProgressState = {
  completedPuzzles: Set<string>;
  completedPerPack: Record<string, number>;
};

type UserState = {
  settings: UserSettings;
  progress: ProgressState;
  streaks: Streak[];
  initialize: () => void;
  updateSettings: (update: Partial<UserSettings>) => void;
  saveProgress: (progress: Progress) => void;
  recordStreak: (type: StreakType) => void;
};

function buildProgress(): ProgressState {
  const completedPuzzles = new Set<string>();
  const completedPerPack: Record<string, number> = {};
  for (const pack of packs) {
    let count = 0;
    for (let i = 0; i < pack.puzzles.length; i++) {
      const id = `${pack.id}:${i}`;
      if (getProgress(id)?.completed) {
        completedPuzzles.add(id);
        count++;
      }
    }
    completedPerPack[pack.id] = count;
  }
  return { completedPuzzles, completedPerPack };
}

export const useUserStore = create<UserState>(set => ({
  settings: getSettings(),
  progress: buildProgress(),
  streaks: getStreaks(),

  initialize: () => {
    const settings = getSettings();
    set({ settings });
  },

  updateSettings: (update: Partial<UserSettings>) => {
    saveSettings(update);
    set(state => ({
      settings: { ...state.settings, ...update },
    }));
  },

  recordStreak: (type: StreakType) => {
    set(state => {
      const currentKey = getCurrentKey(type);
      const prevKey = getPreviousKey(type);
      const existing = state.streaks.find(s => s.type === type);

      if (!existing || existing.lastCompletedKey === currentKey) {
        return state;
      }

      const newCurrent =
        existing.lastCompletedKey === prevKey ? existing.current + 1 : 1;

      const newStreak: Streak = {
        type,
        current: newCurrent,
        lastCompletedKey: currentKey,
      };
      saveStreak(newStreak);

      return {
        streaks: state.streaks.map(s => (s.type === type ? newStreak : s)),
      };
    });
  },

  saveProgress: (progress: Progress) => {
    storageSaveProgress(progress);
    if (progress.completed) {
      set(state => {
        if (state.progress.completedPuzzles.has(progress.puzzleId))
          return state;
        const next = new Set(state.progress.completedPuzzles);
        next.add(progress.puzzleId);
        const packId = progress.puzzleId.split(':')[0];
        return {
          progress: {
            completedPuzzles: next,
            completedPerPack: {
              ...state.progress.completedPerPack,
              [packId]: (state.progress.completedPerPack[packId] ?? 0) + 1,
            },
          },
        };
      });
    }
  },
}));
