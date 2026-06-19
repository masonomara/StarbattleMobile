// NOTE: Settings persistence (MMKV) is intentionally inlined here rather than
// in a separate storage.ts. getSettings() and saveSettings() are private to this
// module — nothing outside the store should read or write settings directly.
// This keeps the persistence layer as an implementation detail of the store.
import { create } from 'zustand';
import { settingsStorage as storage } from '../lib/mmkv';
import type { UserSettings } from '../../types';

const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS: UserSettings = {
  autoXNeighbors: true,
  autoXRowsCols: false,
  autoXRegions: false,
  highlightErrors: true,
  coloredRegions: false,
  alwaysShowTimer: false,
  alwaysShowToolbar: false,
  theme: 'system',
  palette: 'original',
  haptics: true,
  tutorialSeen: false,
};

function getSettings(): UserSettings {
  const json = storage.getString(SETTINGS_KEY);
  if (!json) return DEFAULT_SETTINGS;
  try {
    // Spread over DEFAULT_SETTINGS so any new keys added later get their
    // default values even when the stored JSON predates them.
    return { ...DEFAULT_SETTINGS, ...JSON.parse(json) };
  } catch {
    // Corrupt MMKV value — start fresh rather than crashing.
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(update: Partial<UserSettings>): void {
  const current = getSettings();
  storage.set(SETTINGS_KEY, JSON.stringify({ ...current, ...update }));
}

// Synchronous read for the initial-route decision; MMKV reads are sync.
export function hasSeenTutorial(): boolean {
  return getSettings().tutorialSeen;
}

type SettingsState = {
  settings: UserSettings;
  settingsModalVisible: boolean;
  // Why settings was opened, when that drives purchase attribution. Set on EVERY
  // open (generic open → undefined) so it's always fresh — no reliance on
  // closeSettings firing. Read by AccountSection's upgrade button so a premium
  // purchase started from the streak-archive gate is tagged source:'archive'
  // (the gate routes here via openSettings('archive')). See BASELINE.md §5.3.
  openReason?: 'archive';
  initialize: () => void;
  updateSettings: (update: Partial<UserSettings>) => void;
  openSettings: (reason?: 'archive') => void;
  closeSettings: () => void;
  completeTutorial: () => void;
};

export const useSettingsStore = create<SettingsState>(set => ({
  // Start with defaults so the UI never renders with undefined settings
  // while the synchronous MMKV read runs in initialize().
  settings: DEFAULT_SETTINGS,
  settingsModalVisible: false,

  // Synchronous — getSettings() reads from MMKV which is always available
  // on the JS thread without async I/O. Call once during app startup.
  initialize: () => {
    set({ settings: getSettings() });
  },

  openSettings: reason =>
    set({ settingsModalVisible: true, openReason: reason }),
  closeSettings: () =>
    set({ settingsModalVisible: false, openReason: undefined }),

  // Writes to MMKV first, then updates the store. Order matters: if the app
  // crashes between the two operations the persisted value stays correct.
  updateSettings: update => {
    saveSettings(update);
    set(state => ({ settings: { ...state.settings, ...update } }));
  },

  completeTutorial: () => {
    saveSettings({ tutorialSeen: true });
    set(state => ({ settings: { ...state.settings, tutorialSeen: true } }));
  },
}));
