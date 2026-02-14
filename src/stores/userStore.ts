import { create } from 'zustand';
import {
  setUserId,
  getSettings,
  saveSettings,
  getProgress as storageGetProgress,
  saveProgress as storageSaveProgress,
  getPackProgress,
  savePackProgress,
  computeCompletedCount,
  migrateUserData,
  deleteUserData,
} from '../storage';
import { getAllPacks } from '../packs';
import type {
  UserSettings,
  UserProfile,
  PackProgress,
  Progress,
} from '../types/state';

const DEFAULT_SETTINGS: UserSettings = {
  autoXNeighbors: true,
  autoXRowsCols: false,
  highlightErrors: true,
  showTimer: true,
  theme: 'system',
  haptics: true,
};

type UserState = {
  profile: UserProfile;
  settings: UserSettings;
  packProgress: Record<string, PackProgress>;
  initialize: () => void;
  updateSettings: (update: Partial<UserSettings>) => void;
  getProgress: (puzzleId: string) => Progress | null;
  saveProgress: (progress: Progress) => void;
  refreshPackProgress: (packId: string, totalCount: number) => void;
  incrementPackCompleted: (packId: string) => void;
  switchUser: (newUserId: string, isAnonymous: boolean) => void;
  migrateFromAnonymous: (newUserId: string) => void;
};

export const useUserStore = create<UserState>((set, get) => ({
  profile: { id: 'local', isAnonymous: true },
  settings: DEFAULT_SETTINGS,
  packProgress: {},

  initialize: () => {
    const settings = getSettings();

    const packs = getAllPacks();
    const pp: Record<string, PackProgress> = {};
    for (const pack of packs) {
      const cached = getPackProgress(pack.id);
      if (cached && cached.totalCount === pack.puzzles.length) {
        pp[pack.id] = cached;
      } else {
        const completedCount = computeCompletedCount(
          pack.id,
          pack.puzzles.length,
        );
        const entry: PackProgress = {
          packId: pack.id,
          completedCount,
          totalCount: pack.puzzles.length,
          updatedAt: Date.now(),
        };
        savePackProgress(entry);
        pp[pack.id] = entry;
      }
    }

    set({ settings, packProgress: pp });
  },

  updateSettings: (update: Partial<UserSettings>) => {
    saveSettings(update);
    set(state => ({
      settings: { ...state.settings, ...update },
    }));
  },

  getProgress: (puzzleId: string) => {
    return storageGetProgress(puzzleId);
  },

  saveProgress: (progress: Progress) => {
    storageSaveProgress(progress);
  },

  refreshPackProgress: (packId: string, totalCount: number) => {
    const completedCount = computeCompletedCount(packId, totalCount);
    const entry: PackProgress = {
      packId,
      completedCount,
      totalCount,
      updatedAt: Date.now(),
    };
    savePackProgress(entry);
    set(state => ({
      packProgress: { ...state.packProgress, [packId]: entry },
    }));
  },

  incrementPackCompleted: (packId: string) => {
    const current = get().packProgress[packId];
    if (!current) return;
    const updated: PackProgress = {
      ...current,
      completedCount: current.completedCount + 1,
      updatedAt: Date.now(),
    };
    savePackProgress(updated);
    set(state => ({
      packProgress: { ...state.packProgress, [packId]: updated },
    }));
  },

  switchUser: (newUserId: string, isAnonymous: boolean) => {
    setUserId(newUserId);
    set({ profile: { id: newUserId, isAnonymous } });
    get().initialize();
  },

  migrateFromAnonymous: (newUserId: string) => {
    const packs = getAllPacks();
    const packIds = packs.map(p => p.id);
    const puzzleCounts: Record<string, number> = {};
    for (const pack of packs) {
      puzzleCounts[pack.id] = pack.puzzles.length;
    }

    migrateUserData('local', newUserId, packIds, puzzleCounts);
    get().switchUser(newUserId, false);
    deleteUserData('local', packIds, puzzleCounts);
  },
}));
