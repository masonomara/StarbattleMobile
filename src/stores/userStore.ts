import { create } from 'zustand';
import {
  getSettings,
  saveSettings,
  saveProgress as storageSaveProgress,
  getProgress,
} from '../storage';
import { getAllPacks } from '../packs';
import { makePuzzleId } from '../utils/puzzleId';
import type { UserSettings, Progress, UserState } from '../types/state';

function buildCompletedSet(): Set<string> {
  const completed = new Set<string>();
  for (const pack of getAllPacks()) {
    for (let i = 0; i < pack.puzzles.length; i++) {
      const id = makePuzzleId(pack.id, i);
      if (getProgress(id)?.completed) completed.add(id);
    }
  }
  return completed;
}

export const useUserStore = create<UserState>((set) => ({
  settings: getSettings(),
  completedPuzzles: buildCompletedSet(),

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
        if (state.completedPuzzles.has(progress.puzzleId)) return state;
        const next = new Set(state.completedPuzzles);
        next.add(progress.puzzleId);
        return { completedPuzzles: next };
      });
    }
  },
}));
