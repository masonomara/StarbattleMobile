import { create } from 'zustand';
import {
  getSettings,
  saveSettings,
  saveProgress as storageSaveProgress,
  getProgress,
} from '../storage';
import { packs } from '../packs';
import type { UserSettings, Progress, ProgressState, UserState } from '../types/state';

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

export const useUserStore = create<UserState>((set) => ({
  settings: getSettings(),
  progress: buildProgress(),

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

  saveProgress: (progress: Progress) => {
    storageSaveProgress(progress);
    if (progress.completed) {
      set(state => {
        if (state.progress.completedPuzzles.has(progress.puzzleId)) return state;
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
