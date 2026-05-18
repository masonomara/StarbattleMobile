import { create } from 'zustand';
import type { UserSettings } from '../types/state';
import { getSettings } from '../storage';

type SettingsState = {
  settings: UserSettings;
};

export const useSettingsStore = create<SettingsState>(() => ({
  settings: getSettings(),
}));
