# Plan: User-Scoped Storage & Account Scaffold

## Goal

Restructure the storage system so all user data (settings, puzzle progress) is owned by a user identity rather than the device. Today everything is keyed under the hardcoded `"local"` prefix. After this work, the system will:

- Manage a current user identity (anonymous by default, real ID when accounts arrive)
- Store settings and progress under that identity
- Make settings and progress reactive via Zustand (no more raw MMKV reads in render paths)
- Cache pack-level completion counts instead of computing them O(n) per render
- Provide a migration path from anonymous to authenticated user data
- Keep MMKV as the local persistence layer (fast, synchronous) but decouple consumers from it

No auth provider, no network sync, no server — just the local scaffold that those features will plug into.

---

## Architecture Overview

```
App.tsx
  └─ <UserProvider>          ← NEW: initializes user store on mount
       └─ Navigation
            ├─ HomeScreen       ← reads from useUserStore (not storage.ts)
            ├─ PackScreen       ← reads from useUserStore (not storage.ts)
            └─ PuzzleScreen
                 └─ usePuzzleStore  ← reads settings from useUserStore
                                    ← writes progress through useUserStore
```

**New file:** `src/stores/userStore.ts` — Zustand store holding user identity, settings, and pack progress cache.

**Changed files:**

- `src/types/state.ts` — add `PackProgress`, `UserProfile` types
- `src/storage.ts` — add `getAllProgressForUser()`, `migrateUserData()`, `deleteUserData()`; remove `getCompletedCount()`
- `src/store.ts` — read settings from user store; write progress through user store
- `src/screens/HomeScreen.tsx` — read pack progress from user store
- `src/screens/PackScreen.tsx` — read puzzle progress from user store
- `src/utils/useTheme.ts` — read settings from user store
- `App.tsx` — wrap with `<UserProvider>`

---

## Step 1: Add New Types

**File:** `src/types/state.ts`

Add `PackProgress` and `UserProfile` to the existing types:

```ts
export type CellValue = 0 | 1 | 2;

export type Progress = {
  puzzleId: string;
  cells: CellValue[];
  timeMs: number;
  completed: boolean;
  completedAt?: number;
  updatedAt: number;
};

export type PackProgress = {
  packId: string;
  completedCount: number;
  totalCount: number;
  updatedAt: number;
};

export type UserProfile = {
  id: string;
  isAnonymous: boolean;
};

export type UserSettings = {
  autoXNeighbors: boolean;
  autoXRowsCols: boolean;
  highlightErrors: boolean;
  showTimer: boolean;
  theme: 'system' | 'light' | 'dark';
  haptics: boolean;
};

export type CellChange = {
  index: number;
  previousValue: CellValue;
};

export type Move = {
  changes: CellChange[];
};
```

`PackProgress` is a denormalized cache — it stores the completion count so we don't iterate every puzzle key on every HomeScreen render. `UserProfile` is minimal now; it's the hook point for real auth data later.

---

## Step 2: Expand storage.ts

**File:** `src/storage.ts`

Add three new functions. Remove `getCompletedCount()` (it moves into the user store). Keep the userId mechanism but don't export `setUserId` directly — the user store will be the only thing that calls it.

```ts
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
  highlightErrors: true,
  showTimer: true,
  theme: 'system',
  haptics: true,
};

// --- Settings ---

export function getSettings(): UserSettings {
  const json = storage.getString(KEYS.settings());
  if (!json) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...JSON.parse(json) };
}

export function saveSettings(update: Partial<UserSettings>): void {
  const current = getSettings();
  storage.set(KEYS.settings(), JSON.stringify({ ...current, ...update }));
}

// --- Puzzle Progress ---

export function getProgress(puzzleId: string): Progress | null {
  const json = storage.getString(KEYS.progress(puzzleId));
  return json ? JSON.parse(json) : null;
}

export function saveProgress(progress: Progress): void {
  storage.set(KEYS.progress(progress.puzzleId), JSON.stringify(progress));
}

// --- Pack Progress Cache ---

export function getPackProgress(packId: string): PackProgress | null {
  const json = storage.getString(KEYS.packProgress(packId));
  return json ? JSON.parse(json) : null;
}

export function savePackProgress(packProgress: PackProgress): void {
  storage.set(
    KEYS.packProgress(packProgress.packId),
    JSON.stringify(packProgress),
  );
}

// --- Bulk Operations ---

export function computeCompletedCount(
  packId: string,
  puzzleCount: number,
): number {
  let count = 0;
  for (let i = 0; i < puzzleCount; i++) {
    const json = storage.getString(`${userId}:progress:${packId}:${i}`);
    if (json) {
      const progress = JSON.parse(json) as Progress;
      if (progress.completed) count++;
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
  // Migrate settings
  const settingsJson = storage.getString(`${fromUserId}:settings`);
  if (settingsJson) {
    storage.set(`${toUserId}:settings`, settingsJson);
  }

  // Migrate puzzle progress and pack progress
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
  storage.delete(`${targetUserId}:settings`);
  for (const packId of packIds) {
    const count = puzzleCounts[packId] ?? 0;
    for (let i = 0; i < count; i++) {
      storage.delete(`${targetUserId}:progress:${packId}:${i}`);
    }
    storage.delete(`${targetUserId}:packProgress:${packId}`);
  }
}
```

Key decisions:

- `migrateUserData()` copies keys from one userId namespace to another. This is the anonymous-to-authenticated upgrade path.
- `deleteUserData()` cleans up a namespace after migration (or account logout).
- `computeCompletedCount()` is the raw O(n) scan, only called during initialization or after a puzzle completes — not on every render.
- `getCompletedCount()` is removed. Screens will read from the user store's cached `packProgress` map.

---

## Step 3: Create the User Store

**File:** `src/stores/userStore.ts`

This is the core new piece. A Zustand store that owns user identity, settings, and pack progress. It is the only thing that calls `setUserId()`.

```ts
import { create } from 'zustand';
import {
  setUserId,
  getSettings,
  saveSettings,
  getProgress,
  saveProgress,
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

  // Actions
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
    // Load settings from MMKV into Zustand
    const settings = getSettings();

    // Build pack progress cache
    const packs = getAllPacks();
    const packProgress: Record<string, PackProgress> = {};
    for (const pack of packs) {
      const cached = getPackProgress(pack.id);
      if (cached && cached.totalCount === pack.puzzles.length) {
        packProgress[pack.id] = cached;
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
        packProgress[pack.id] = entry;
      }
    }

    set({ settings, packProgress });
  },

  updateSettings: (update: Partial<UserSettings>) => {
    saveSettings(update);
    set(state => ({
      settings: { ...state.settings, ...update },
    }));
  },

  getProgress: (puzzleId: string) => {
    return getProgress(puzzleId);
  },

  saveProgress: (progress: Progress) => {
    saveProgress(progress);
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
    set({
      profile: { id: newUserId, isAnonymous },
    });
    // Re-initialize to load the new user's data
    get().initialize();
  },

  migrateFromAnonymous: (newUserId: string) => {
    const packs = getAllPacks();
    const packIds = packs.map(p => p.id);
    const puzzleCounts: Record<string, number> = {};
    for (const pack of packs) {
      puzzleCounts[pack.id] = pack.puzzles.length;
    }

    // Copy local data to new user namespace
    migrateUserData('local', newUserId, packIds, puzzleCounts);

    // Switch to new user (re-initializes from their namespace)
    get().switchUser(newUserId, false);

    // Clean up anonymous data
    deleteUserData('local', packIds, puzzleCounts);
  },
}));
```

Key design decisions:

1. **`initialize()` runs once on app mount.** It loads settings from MMKV into Zustand state and builds the pack progress cache. If a cached `PackProgress` exists in MMKV with the right `totalCount`, use it. Otherwise, do the O(n) scan once and cache the result.

2. **`incrementPackCompleted()`** is the fast path — when a puzzle is completed, bump the cached count by 1 instead of re-scanning. This avoids ever calling `computeCompletedCount()` during normal gameplay.

3. **`migrateFromAnonymous()`** is the account upgrade path. Copy all `local:*` keys to `{newUserId}:*`, switch user, then delete the anonymous data.

4. **`switchUser()`** is for future multi-account or logout/login flows. It changes the userId, then re-initializes.

5. **Settings are reactive.** `updateSettings()` writes to MMKV and updates Zustand state in one call. Any component subscribed to `useUserStore(s => s.settings)` re-renders immediately.

---

## Step 4: Create UserProvider

**File:** `src/components/UserProvider.tsx`

A thin component that calls `initialize()` once on mount. Placed at the root of the app.

```tsx
import { useEffect } from 'react';
import { useUserStore } from '../stores/userStore';

export function UserProvider({ children }: { children: React.ReactNode }) {
  const initialize = useUserStore(s => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return children;
}
```

No loading state needed — MMKV reads are synchronous, so `initialize()` completes before the first render of children.

---

## Step 5: Update App.tsx

**File:** `App.tsx`

Wrap the app in `UserProvider`:

```tsx
import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Navigation } from './src/navigation';
import { UserProvider } from './src/components/UserProvider';

export default function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <UserProvider>
          <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
          <Navigation />
        </UserProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

---

## Step 6: Update store.ts (Puzzle Store)

**File:** `src/store.ts`

Stop importing from `storage.ts` directly. Read settings from the user store. Write progress through the user store.

```ts
import { create } from 'zustand';
import { hapticLight, hapticSuccess } from './haptics';
import { useUserStore } from './stores/userStore';
import type { CellValue, Progress, Move, CellChange } from './types/state';
import type { Puzzle } from './types/puzzle';

type PuzzleState = {
  puzzle: Puzzle | null;
  boardSize: number;
  cells: CellValue[];
  errorCells: Set<string>;
  completed: boolean;
  timeMs: number;
  moveLog: Move[];
  loadPuzzle: (puzzle: Puzzle) => void;
  tapCell: (row: number, col: number) => void;
  undo: () => void;
  tick: () => void;
};

export const usePuzzleStore = create<PuzzleState>((set, get) => ({
  puzzle: null,
  boardSize: 0,
  cells: [],
  errorCells: new Set<string>(),
  completed: false,
  timeMs: 0,
  moveLog: [],

  loadPuzzle: (puzzle: Puzzle) => {
    const total = puzzle.size * puzzle.size;
    const saved = useUserStore.getState().getProgress(puzzle.id);
    set({
      puzzle,
      boardSize: puzzle.size,
      cells: saved ? saved.cells : new Array<CellValue>(total).fill(0),
      errorCells: new Set<string>(),
      completed: saved?.completed ?? false,
      timeMs: saved?.timeMs ?? 0,
      moveLog: [],
    });
  },

  tapCell: (row: number, col: number) => {
    const { cells, boardSize, completed, puzzle } = get();
    if (completed || !puzzle) return;

    const settings = useUserStore.getState().settings;
    const idx = row * boardSize + col;
    const current = cells[idx];

    const changes: CellChange[] = [];
    const newCells = [...cells];

    const next: CellValue = current === 0 ? 2 : current === 2 ? 1 : 0;
    changes.push({ index: idx, previousValue: current });
    newCells[idx] = next;

    if (next === 1 && settings.autoXNeighbors) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = row + dr;
          const nc = col + dc;
          if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize) {
            const nIdx = nr * boardSize + nc;
            if (newCells[nIdx] === 0) {
              changes.push({ index: nIdx, previousValue: newCells[nIdx] });
              newCells[nIdx] = 2;
            }
          }
        }
      }
    }

    if (next === 1 && settings.autoXRowsCols) {
      // ... (autoX row/col/region logic unchanged)
    }

    if (settings.haptics) hapticLight();

    set(state => ({
      cells: newCells,
      moveLog: [...state.moveLog, { changes }],
    }));

    // Check win
    const playerStars: string[] = [];
    for (let i = 0; i < newCells.length; i++) {
      if (newCells[i] === 1) {
        playerStars.push(`${Math.floor(i / boardSize)},${i % boardSize}`);
      }
    }
    const solutionSet = new Set(puzzle.solution.map(([r, c]) => `${r},${c}`));
    const won =
      playerStars.length === solutionSet.size &&
      playerStars.every(s => solutionSet.has(s));

    if (won) {
      if (settings.haptics) hapticSuccess();
      set({ completed: true });
    }

    persistProgress(get(), won);
  },

  undo: () => {
    const { moveLog, cells } = get();
    if (moveLog.length === 0) return;

    const lastMove = moveLog[moveLog.length - 1];
    const newCells = [...cells];

    for (let i = lastMove.changes.length - 1; i >= 0; i--) {
      const { index, previousValue } = lastMove.changes[i];
      newCells[index] = previousValue;
    }

    const settings = useUserStore.getState().settings;
    if (settings.haptics) hapticLight();

    set({
      cells: newCells,
      moveLog: moveLog.slice(0, -1),
    });
    persistProgress(get(), false);
  },

  tick: () => {
    const { completed } = get();
    if (completed) return;
    set(state => ({ timeMs: state.timeMs + 1000 }));
  },
}));

function persistProgress(state: PuzzleState, justCompleted: boolean): void {
  if (!state.puzzle) return;
  const progress: Progress = {
    puzzleId: state.puzzle.id,
    cells: state.cells,
    timeMs: state.timeMs,
    completed: state.completed,
    completedAt: state.completed ? Date.now() : undefined,
    updatedAt: Date.now(),
  };
  useUserStore.getState().saveProgress(progress);

  // If this tap caused a win, bump the cached pack progress
  if (justCompleted) {
    const packId = state.puzzle.id.split(':')[0];
    useUserStore.getState().incrementPackCompleted(packId);
  }
}
```

Changes from current:

- `getSettings()` → `useUserStore.getState().settings` (reads from Zustand, not MMKV)
- `getProgress()` → `useUserStore.getState().getProgress()` (goes through user store)
- `saveProgress()` → `useUserStore.getState().saveProgress()` (goes through user store)
- `persistProgress()` now takes a `justCompleted` flag. When true, it calls `incrementPackCompleted()` to update the cached count without a full rescan.

The autoX row/col/region logic in `tapCell` is unchanged — omitted above for brevity.

---

## Step 7: Update HomeScreen

**File:** `src/screens/HomeScreen.tsx`

Replace `getCompletedCount()` with the user store's cached `packProgress`.

```tsx
import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getAllPacks } from '../packs';
import { useUserStore } from '../stores/userStore';
import {
  SPACING_XS,
  SPACING_MD,
  SPACING_XL,
  RADIUS_MD,
  FONT_SIZE_SM,
  FONT_SIZE_MD,
  FONT_SIZE_LG,
  FONT_WEIGHT_SEMIBOLD,
} from '../utils/constants';
import type { Pack } from '../types/puzzle';
import type { RootStackParams } from '../navigation';
import { useTheme } from '../utils/useTheme';

type Props = NativeStackScreenProps<RootStackParams, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const packs = getAllPacks();
  const theme = useTheme();
  const packProgress = useUserStore(s => s.packProgress);

  const [focusCount, setFocusCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusCount(c => c + 1);
    }, []),
  );

  const renderPack = ({ item }: { item: Pack }) => {
    const total = item.puzzles.length;
    const completed = packProgress[item.id]?.completedCount ?? 0;

    return (
      <Pressable
        style={[
          styles.packCard,
          { backgroundColor: theme.card, shadowColor: theme.shadow },
        ]}
        onPress={() => navigation.navigate('Pack', { packId: item.id })}
      >
        <View style={styles.packInfo}>
          <Text style={[styles.packName, { color: theme.text }]}>
            {item.name}
          </Text>
          <Text style={[styles.packMeta, { color: theme.textSecondary }]}>
            {item.gridSize}x{item.gridSize}
          </Text>
        </View>
        <Text style={[styles.packProgress, { color: theme.accent }]}>
          {completed}/{total}
        </Text>
      </Pressable>
    );
  };

  return (
    <FlatList
      data={packs}
      extraData={focusCount}
      keyExtractor={p => p.id}
      renderItem={renderPack}
      contentContainerStyle={styles.list}
      style={{ backgroundColor: theme.bg }}
    />
  );
}
```

Changes:

- Remove `import { getCompletedCount } from '../storage'`
- Add `import { useUserStore } from '../stores/userStore'`
- `const packProgress = useUserStore(s => s.packProgress)` — subscribes to Zustand, re-renders when pack progress changes
- `getCompletedCount(item.id, total)` → `packProgress[item.id]?.completedCount ?? 0` — O(1) lookup from cache

The `focusCount` / `useFocusEffect` trick is still useful for forcing re-renders when navigating back, since the `packProgress` Zustand subscription already handles re-renders when completions change. Over time this `focusCount` mechanism can be removed since Zustand handles reactivity, but it's harmless to leave for now.

---

## Step 8: Update PackScreen

**File:** `src/screens/PackScreen.tsx`

Replace direct `getProgress()` calls with the user store.

```tsx
import React, { useCallback, useState } from 'react';
import { Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getPack } from '../packs';
import { useUserStore } from '../stores/userStore';
import {
  SPACING_SM,
  SPACING_LG,
  RADIUS_SM,
  FONT_SIZE_LG,
  FONT_WEIGHT_SEMIBOLD,
  GRID_COLUMNS,
  SHADOW_SM,
} from '../utils/constants';
import type { RootStackParams } from '../navigation';
import type { RawPuzzle } from '../types/puzzle';
import { useTheme } from '../utils/useTheme';

type Props = NativeStackScreenProps<RootStackParams, 'Pack'>;

export function PackScreen({ route, navigation }: Props) {
  const { packId } = route.params;
  const pack = getPack(packId);
  const theme = useTheme();
  const userGetProgress = useUserStore(s => s.getProgress);

  const [focusCount, setFocusCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusCount(c => c + 1);
    }, []),
  );

  React.useEffect(() => {
    if (pack) navigation.setOptions({ title: pack.name });
  }, [pack, navigation]);

  if (!pack) return null;

  const renderPuzzle = ({
    item: _item,
    index,
  }: {
    item: RawPuzzle;
    index: number;
  }) => {
    const puzzleId = `${packId}:${index}`;
    const progress = userGetProgress(puzzleId);
    const isCompleted = progress?.completed ?? false;

    return (
      <Pressable
        style={[
          styles.puzzleCell,
          {
            backgroundColor: isCompleted ? theme.accentMuted : theme.card,
            shadowColor: theme.shadow,
          },
        ]}
        onPress={() =>
          navigation.navigate('Puzzle', { packId, puzzleIndex: index })
        }
      >
        <Text
          style={[
            styles.puzzleNumber,
            { color: isCompleted ? theme.accent : theme.text },
          ]}
        >
          {index + 1}
        </Text>
      </Pressable>
    );
  };

  return (
    <FlatList
      data={pack.puzzles}
      extraData={focusCount}
      keyExtractor={(_, i) => String(i)}
      renderItem={renderPuzzle}
      numColumns={GRID_COLUMNS}
      contentContainerStyle={styles.grid}
      style={{ backgroundColor: theme.bg }}
    />
  );
}
```

Change: `getProgress()` now comes from `useUserStore(s => s.getProgress)` instead of `import { getProgress } from '../storage'`. This routes through the user store, which ensures the correct userId is always used. The actual read is still synchronous MMKV under the hood — no behavior change, just routing.

Note: `getProgress` on the user store is currently a passthrough to `storage.getProgress()`. Individual puzzle progress is NOT cached in Zustand state (that would be too much data). The store just ensures the right userId is active. If puzzle-level caching is needed later, it can be added to the user store without changing consumers.

---

## Step 9: Update useTheme

**File:** `src/utils/useTheme.ts`

Read settings from the user store instead of MMKV directly. This makes theme reactive to settings changes.

```ts
import { useColorScheme } from 'react-native';
import { useUserStore } from '../stores/userStore';

export type Theme = {
  bg: string;
  card: string;
  text: string;
  textSecondary: string;
  regionBorder: string;
  innerBorder: string;
  cellBg: string;
  starColor: string;
  starErrorColor: string;
  markColor: string;
  accent: string;
  accentMuted: string;
  onAccent: string;
  shadow: string;
};

export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const themePref = useUserStore(s => s.settings.theme);

  if (themePref === 'light') return light;
  if (themePref === 'dark') return dark;
  return systemScheme === 'dark' ? dark : light;
}

const light: Theme = {
  /* unchanged */
};
const dark: Theme = {
  /* unchanged */
};
```

Change: `getSettings()` → `useUserStore(s => s.settings.theme)`. Only subscribes to the `theme` field, so other settings changes don't cause re-renders.

---

## Step 10: Update PuzzleScreen (Minimal)

**File:** `src/screens/PuzzleScreen.tsx`

No changes needed. PuzzleScreen only interacts with `usePuzzleStore`, which now internally routes through `useUserStore`. The screen code stays the same.

---

## File Change Summary

| File                              | Action  | What Changes                                                                                                                         |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/types/state.ts`              | Edit    | Add `PackProgress`, `UserProfile` types                                                                                              |
| `src/storage.ts`                  | Edit    | Add `getPackProgress`, `savePackProgress`, `computeCompletedCount`, `migrateUserData`, `deleteUserData`. Remove `getCompletedCount`. |
| `src/stores/userStore.ts`         | **New** | Zustand store: user identity, settings, pack progress cache, migration                                                               |
| `src/components/UserProvider.tsx` | **New** | Calls `initialize()` on mount                                                                                                        |
| `App.tsx`                         | Edit    | Wrap in `<UserProvider>`                                                                                                             |
| `src/store.ts`                    | Edit    | Read settings/progress from `useUserStore` instead of `storage.ts`                                                                   |
| `src/screens/HomeScreen.tsx`      | Edit    | Read pack progress from `useUserStore`                                                                                               |
| `src/screens/PackScreen.tsx`      | Edit    | Read puzzle progress from `useUserStore`                                                                                             |
| `src/utils/useTheme.ts`           | Edit    | Read theme pref from `useUserStore`                                                                                                  |

---

## Implementation Order

1. **Types** (`state.ts`) — zero risk, additive only
2. **Storage** (`storage.ts`) — add new functions, deprecate `getCompletedCount`
3. **User Store** (`stores/userStore.ts`) — new file, no consumers yet
4. **UserProvider** (`components/UserProvider.tsx`) — new file
5. **App.tsx** — wrap in provider
6. **useTheme** — swap to user store (smallest consumer, good smoke test)
7. **store.ts** — swap to user store (biggest change, most risk)
8. **HomeScreen** — swap to user store pack progress
9. **PackScreen** — swap to user store getProgress
10. **Clean up** — remove deprecated `getCompletedCount`, verify no stale imports

Steps 1-5 can be done without breaking anything. Steps 6-9 are consumer swaps that should be done together to avoid a mixed state where some code reads from `storage.ts` and some from the user store.

---

## Todo List

### Phase 1: Foundation (types + storage layer)

No consumers change. Nothing can break. Pure additive work.

- [x] **1.1** Add `PackProgress` type to `src/types/state.ts`
  - Fields: `packId`, `completedCount`, `totalCount`, `updatedAt`
- [x] **1.2** Add `UserProfile` type to `src/types/state.ts`
  - Fields: `id`, `isAnonymous`
- [x] **1.3** Add `packProgress` key function to `KEYS` object in `src/storage.ts`
  - Pattern: `${userId}:packProgress:${packId}`
- [x] **1.4** Add `getPackProgress()` function to `src/storage.ts`
  - Reads and parses a single pack progress entry from MMKV
- [x] **1.5** Add `savePackProgress()` function to `src/storage.ts`
  - Serializes and writes a `PackProgress` to MMKV
- [x] **1.6** Add `computeCompletedCount()` function to `src/storage.ts`
  - O(n) scan of puzzle keys for a pack, returns completed count
  - Uses direct `storage.getString()` with explicit userId prefix (not the `KEYS` helper) since it may be called during migration with a different userId
- [x] **1.7** Add `migrateUserData()` function to `src/storage.ts`
  - Params: `fromUserId`, `toUserId`, `packIds`, `puzzleCounts`
  - Copies settings, all puzzle progress keys, and all pack progress keys from one namespace to another
- [x] **1.8** Add `deleteUserData()` function to `src/storage.ts`
  - Params: `targetUserId`, `packIds`, `puzzleCounts`
  - Deletes settings, all puzzle progress keys, and all pack progress keys for a namespace
- [x] **1.9** Mark `getCompletedCount()` as `// DEPRECATED` in `src/storage.ts`
  - Do NOT remove yet — HomeScreen still calls it. Actual removal happens in Phase 3.

**Checkpoint:** `storage.ts` has all new functions. Types are in place. App still compiles and runs identically — no consumer has changed.

---

### Phase 2: User store + provider (new files only)

Create the two new files. Nothing imports them yet. App behavior unchanged.

- [x] **2.1** Create directory `src/stores/`
- [x] **2.2** Create `src/stores/userStore.ts` with the Zustand store
  - State: `profile` (UserProfile), `settings` (UserSettings), `packProgress` (Record<string, PackProgress>)
  - Action: `initialize()` — loads settings from MMKV, builds pack progress cache (uses cached MMKV entry if `totalCount` matches, else does `computeCompletedCount` scan and writes result)
  - Action: `updateSettings(partial)` — writes to MMKV + updates Zustand state
  - Action: `getProgress(puzzleId)` — passthrough to `storage.getProgress()`
  - Action: `saveProgress(progress)` — passthrough to `storage.saveProgress()`
  - Action: `incrementPackCompleted(packId)` — bumps cached count by 1, writes to MMKV
  - Action: `refreshPackProgress(packId, totalCount)` — does full rescan for one pack
  - Action: `switchUser(newUserId, isAnonymous)` — calls `setUserId()`, updates profile, calls `initialize()`
  - Action: `migrateFromAnonymous(newUserId)` — calls `migrateUserData()`, then `switchUser()`, then `deleteUserData()`
- [x] **2.3** Create `src/components/UserProvider.tsx`
  - Calls `useUserStore(s => s.initialize)` in a `useEffect` on mount
  - Returns `children` directly (no wrapper element, no loading state)

**Checkpoint:** Two new files exist. No file imports them. `tsc` should pass. App runs identically.

---

### Phase 3: Wire up provider + migrate consumers

This phase changes imports and call sites. All steps should be done together to avoid mixed state.

- [x] **3.1** Update `App.tsx`
  - Import `UserProvider` from `./src/components/UserProvider`
  - Wrap `<StatusBar>` and `<Navigation>` inside `<UserProvider>`
- [x] **3.2** Update `src/utils/useTheme.ts`
  - Remove `import { getSettings } from '../storage'`
  - Add `import { useUserStore } from '../stores/userStore'`
  - Replace `const settings = getSettings()` + `settings.theme` with `const themePref = useUserStore(s => s.settings.theme)`
  - Update conditional to use `themePref` instead of `settings.theme`
  - Keep `useColorScheme()`, `light`, and `dark` objects unchanged
- [x] **3.3** Update `src/store.ts` — change imports
  - Remove `import { getProgress, saveProgress, getSettings } from './storage'`
  - Add `import { useUserStore } from './stores/userStore'`
- [x] **3.4** Update `src/store.ts` → `loadPuzzle()`
  - Replace `getProgress(puzzle.id)` with `useUserStore.getState().getProgress(puzzle.id)`
- [x] **3.5** Update `src/store.ts` → `tapCell()`
  - Replace `const settings = getSettings()` with `const settings = useUserStore.getState().settings`
  - All autoX and haptics logic stays identical — only the settings source changes
- [x] **3.6** Update `src/store.ts` → `undo()`
  - Replace `const settings = getSettings()` with `const settings = useUserStore.getState().settings`
- [x] **3.7** Update `src/store.ts` → `persistProgress()` signature
  - Add second parameter: `justCompleted: boolean`
  - Replace `saveProgress(progress)` with `useUserStore.getState().saveProgress(progress)`
  - When `justCompleted` is true, extract packId via `state.puzzle.id.split(':')[0]` and call `useUserStore.getState().incrementPackCompleted(packId)`
- [x] **3.8** Update `src/store.ts` → `tapCell()` — capture win result
  - Store the win check result in a `const won` boolean
  - Pass it to `persistProgress(get(), won)` instead of `persistProgress(get())`
- [x] **3.9** Update `src/store.ts` → `undo()` — update `persistProgress` call
  - Change `persistProgress(get())` to `persistProgress(get(), false)`
- [x] **3.10** Update `src/screens/HomeScreen.tsx`
  - Remove `import { getCompletedCount } from '../storage'`
  - Add `import { useUserStore } from '../stores/userStore'`
  - Add `const packProgress = useUserStore(s => s.packProgress)` in component body
  - In `renderPack`, replace `getCompletedCount(item.id, total)` with `packProgress[item.id]?.completedCount ?? 0`
- [x] **3.11** Update `src/screens/PackScreen.tsx`
  - Remove `import { getProgress } from '../storage'`
  - Add `import { useUserStore } from '../stores/userStore'`
  - Add `const userGetProgress = useUserStore(s => s.getProgress)` in component body
  - In `renderPuzzle`, replace `getProgress(puzzleId)` with `userGetProgress(puzzleId)`
- [x] **3.12** Remove `getCompletedCount()` from `src/storage.ts`
  - Delete the function and its `// DEPRECATED` comment entirely
  - No file should import it anymore

**Checkpoint:** All consumers route through `useUserStore`. No file except `userStore.ts` imports from `storage.ts`. App compiles, runs, and behaves identically.

---

### Phase 4: Verify + clean up

- [x] **4.1** Grep for stale imports — verify no direct `storage.ts` imports remain outside `userStore.ts`
  - Search for `from '../storage'` and `from './storage'` in all `.ts`/`.tsx` files
  - Only `src/stores/userStore.ts` should import from `storage`
- [x] **4.2** Grep for `getCompletedCount` — should return zero results outside docs/plans
- [ ] **4.3** _(manual)_ Test puzzle lifecycle: open puzzle → place marks/stars → navigate away → come back → progress restores
- [ ] **4.4** _(manual)_ Test completion: solve a puzzle → win banner → navigate to PackScreen → cell shows completed → navigate to HomeScreen → count incremented
- [ ] **4.5** _(manual)_ Test undo: place marks → undo → verify cells revert, haptics fire
- [ ] **4.6** _(manual)_ Test fresh install: clear MMKV (or fresh simulator) → app starts with defaults and zero progress → `initialize()` scans and caches `PackProgress` entries with `completedCount: 0`
- [ ] **4.7** _(manual)_ Test theme reactivity: call `useUserStore.getState().updateSettings({ theme: 'dark' })` manually → all themed components should re-render immediately
- [ ] **4.8** _(manual)_ Inspect MMKV keys after gameplay — verify structure:
  - `local:settings`
  - `local:packProgress:intro`, `local:packProgress:1star-5x5`, etc.
  - `local:progress:intro:0`, `local:progress:intro:1`, etc.
- [x] **4.9** iOS build: `cd ios && pod install && npx react-native build-ios --mode Debug`
- [ ] **4.10** Android build: `npx react-native build-android --mode debug`

**Checkpoint:** All verified. Storage is user-scoped, reactive, and ready for accounts.
