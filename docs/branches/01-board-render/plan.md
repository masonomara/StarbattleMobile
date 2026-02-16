# Implementation Plan: Star Battle Mobile (Phase 1)

Local-only playable game. No server, no auth, no sync, no purchases, no ads.

---

## What Exists

- **Solver engine** in `/sieve/` — own package.json and test suite
- **5 puzzle packs** in `/packs/` — each has 30 puzzles with pre-computed solutions
- **React Native 0.84.0** scaffold — bare (not Expo), React 19.2.3, React Navigation installed (native + native-stack), safe area context, screens. Stock template.

## What We're Building

Everything a player needs to download the app, open it, pick a puzzle, play it through, and come back for more.

---

## Step 1: Dependencies

Install what we need. Nothing else.

```bash
npm install react-native-mmkv react-native-haptic-feedback react-native-gesture-handler zustand lucide-react-native react-native-nitro-modules
cd ios && pod install && cd ..
```

**react-native-mmkv** — fast key-value storage for puzzle progress and settings. Crash-safe, synchronous reads.

**react-native-haptic-feedback** — tap feedback on cell cycles and win detection.

**react-native-gesture-handler** — already a transitive dependency of React Navigation but we need it explicitly for tap handling, pinch-to-zoom, and pan gestures on the board.

**react-native-nitro-modules** — required peer dependency for react-native-mmkv v4.

**zustand** — lightweight state management with selectors. Each cell subscribes to its own slice of state, so tapping one cell only re-renders that cell (and its auto-X neighbors), not the entire board. Zustand is state management, not rendering — standard React Native Views handle grids up to 10x10 (100 cells) with no issues, and cell-level subscriptions keep re-renders minimal. If Phase 2's larger grids (14x14+) show rendering bottlenecks, the board renderer (BoardView/CellView) can be swapped to react-native-skia without changing the state management layer.

**lucide-react-native** — icon library for toolbar buttons (undo, zoom reset). Lightweight, tree-shakeable.

---

## Step 2: Types and Data Layer

All types live in `src/types/` folder. Every type definition in the app goes here — no inline type exports from component or utility files.

### `src/types/puzzle.ts`

The puzzle data types. `RawPuzzle` is the shape straight from the pack JSON — SBN string, pre-computed solution. `Puzzle` is the parsed representation the app works with — SBN is parsed when a puzzle is loaded for play so nothing downstream ever sees raw encoded strings. `Pack` holds metadata plus an array of `RawPuzzle`s.

```typescript
export type Coord = [number, number];

export type RawPuzzle = {
  sbn: string;
  solution: Coord[];
};

export type Puzzle = {
  id: string;
  size: number;
  stars: number;
  regions: number[][];
  solution: Coord[];
};

export type Pack = {
  id: string;
  name: string;
  version: number;
  free: boolean;
  gridSize: number;
  stars: number;
  puzzles: RawPuzzle[];
};

// Board display — which edges of a cell are region boundaries
export type Borders = {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
};
```

### `src/types/state.ts`

Runtime and persisted state types.

```typescript
export type CellValue = 0 | 1 | 2; // 0=empty, 1=star, 2=marked

export type Progress = {
  puzzleId: string; // "{packId}:{index}"
  cells: CellValue[]; // flat array, length = gridSize²
  timeMs: number;
  completed: boolean;
  completedAt?: number; // unix ms
  updatedAt: number; // unix ms
};

export type UserSettings = {
  autoXNeighbors: boolean;
  autoXRowsCols: boolean;
  highlightErrors: boolean;
  showTimer: boolean;
  theme: 'system' | 'light' | 'dark';
  haptics: boolean;
};

export type PackProgress = {
  packId: string;
  completedPuzzleIds: string[];
};

// A single cell change within a move. Records what was there before so undo can restore it.
export type CellChange = {
  index: number; // flat index into cells array
  previousValue: CellValue;
};

// One player action (tap). Contains the tapped cell change plus any auto-X cells that were marked as a side effect. Auto-X neighbors (adjacent cells) is controlled by `autoXNeighbors` (default on). Auto-X for completed rows/columns/regions is controlled by `autoXRowsCols` (default off). On undo, iterate changes in reverse and restore each previousValue — both neighbor marks and row/col/region marks are reverted.
export type Move = {
  changes: CellChange[];
};
```

### `src/storage.ts`

Thin wrapper over MMKV. All reads are synchronous. All writes are fire-and-forget (MMKV is crash-safe).

```typescript
import { createMMKV } from 'react-native-mmkv';
import type { UserSettings, Progress, PackProgress } from './types/state';

const storage = createMMKV({ id: 'starbattle' });

const KEYS = {
  settings: 'user_settings',
  progress: (puzzleId: string) => `progress:${puzzleId}`,
  packProgress: (packId: string) => `pack_progress:${packId}`,
} as const;

const DEFAULT_SETTINGS: UserSettings = {
  autoXNeighbors: true,
  autoXRowsCols: false,
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

export function getProgress(puzzleId: string): Progress | null {
  const json = storage.getString(KEYS.progress(puzzleId));
  return json ? JSON.parse(json) : null;
}

export function saveProgress(progress: Progress): void {
  storage.set(KEYS.progress(progress.puzzleId), JSON.stringify(progress));
}

export function getPackProgress(packId: string): PackProgress {
  const json = storage.getString(KEYS.packProgress(packId));
  if (!json) return { packId, completedPuzzleIds: [] };
  return JSON.parse(json);
}

export function markPuzzleCompleted(packId: string, puzzleId: string): void {
  const current = getPackProgress(packId);
  if (current.completedPuzzleIds.includes(puzzleId)) return;
  current.completedPuzzleIds.push(puzzleId);
  storage.set(KEYS.packProgress(packId), JSON.stringify(current));
}
```

`saveSettings` takes a partial — callers pass only the fields they want to change, the rest is preserved from MMKV.

### `src/packs.ts`

Load the bundled JSON packs. These are **sample puzzles for standing up the app and testing UI/UX**. The production version will load puzzle packs from a different delivery system (bundled binary assets or remote storage). This import-based loader will be replaced.

```typescript
// DEV/TEST: Static imports for development. Production will use a
// different pack delivery system (binary assets or remote fetch).
import introData from '../packs/intro.json';
import fiveStar from '../packs/1star-5x5.json';
import sixStar from '../packs/1star-6x6.json';
import eightStar from '../packs/1star-8x8.json';
import tenStar from '../packs/2star-10x10.json';
import type { Pack } from './types/puzzle';

const PACKS: Pack[] = [
  introData as unknown as Pack,
  fiveStar as unknown as Pack,
  sixStar as unknown as Pack,
  eightStar as unknown as Pack,
  tenStar as unknown as Pack,
];

export function getAllPacks(): Pack[] {
  return PACKS;
}

export function getPack(id: string): Pack | undefined {
  return PACKS.find(p => p.id === id);
}
```

---

## Step 3: Puzzle Parser

The app works with `Puzzle` objects, not raw SBN strings or raw pack JSON. SBN is a compact notation for the generator/solver — the mobile app needs a fully-parsed structure that combines the grid layout, and solution into one object.

### `src/puzzle-parser.ts`

```typescript
import type { RawPuzzle, Puzzle } from './types/puzzle';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Takes a raw puzzle from pack JSON and produces the object the app works with.
export function parsePuzzle(raw: RawPuzzle, puzzleId: string): Puzzle {
  const parts = raw.sbn.split('.');
  const [header, layout] = parts;
  const match = header.match(/^(\d+)x(\d+)$/);
  if (!match) throw new Error(`Bad SBN header: ${header}`);

  const size = parseInt(match[1], 10);
  const stars = parseInt(match[2], 10);

  const regions: number[][] = [];
  for (let row = 0; row < size; row++) {
    const rowData: number[] = [];
    for (let col = 0; col < size; col++) {
      const char = layout[row * size + col];
      rowData.push(LETTERS.indexOf(char.toUpperCase()));
    }
    regions.push(rowData);
  }

  return {
    id: puzzleId,
    size,
    stars,
    regions,
    solution: raw.solution,
  };
}
```

One function, one output type. Everything the app needs for gameplay is in the returned `Puzzle`.

---

## Step 4: Board Renderer

The core visual. A grid of cells where each cell owns its own border rendering.

### Architecture

- `BoardView` — the container. Wraps the cell grid in simultaneous pinch-to-zoom and pan gesture handlers. Cells are a fixed 38 pixels. The board dimensions are determined by the cells (`38 * gridSize`) — larger puzzles are why zoom and pan are essential.
- `CellView` — one cell. Renders content (empty, star icon, X mark) and its own borders. Each cell determines its border widths based on whether its neighbors belong to the same region. Inner borders: 1px. Region borders: 3px. All colors come from the theme.
- Cell size is fixed at 38px. Does not change during gameplay. Players can pinch-to-zoom with two fingers and pan to navigate larger boards.
- Errors are represented by changing the star color to red — cell backgrounds never change for errors.

### `src/constants/board.ts`

Board style constants — adjust these during development to iterate on the board look. Colors come from the theme (light/dark aware). Dimensions and structure live here.

```typescript
export const CELL_SIZE = 38;
export const REGION_BORDER_WIDTH = 3;
export const INNER_BORDER_WIDTH = 1;
export const INNER_BORDER_STYLE: 'solid' | 'dashed' | 'dotted' = 'solid';
```

### `src/components/BoardView.tsx`

Uses RN's built-in `Animated` API (react-native-reanimated is incompatible with RN 0.84). Pinch-to-zoom and pan use gesture-handler's Gesture API with `Animated.Value` refs.

See `src/components/BoardView.tsx` for the full implementation.

### `src/components/CellView.tsx`

Each cell subscribes to its own slice of the Zustand store. When cell 42 changes, only cell 42 (and its auto-X neighbors) re-render. The board never re-renders.

Each cell renders its own borders. The `borders` prop tells the cell which edges are region boundaries (3px, theme region color) vs inner grid lines (1px, theme inner color).

Errors are shown by changing the star color to red. Cell background stays the same — no background color changes for errors.

```tsx
import React, { memo, useCallback } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { usePuzzleStore } from '../store';
import { useTheme } from '../theme';
import {
  REGION_BORDER_WIDTH,
  INNER_BORDER_WIDTH,
  INNER_BORDER_STYLE,
} from '../constants/board';
import type { Borders } from '../types/puzzle';

type Props = {
  row: number;
  col: number;
  size: number;
  borders: Borders;
  onPress: (row: number, col: number) => void;
};

export const CellView = memo(function CellView({
  row,
  col,
  size,
  borders,
  onPress,
}: Props) {
  const theme = useTheme();
  const value = usePuzzleStore(s => s.cells[row * s.boardSize + col]);
  const hasError = usePuzzleStore(s => s.errorCells.has(`${row},${col}`));

  const handlePress = useCallback(() => onPress(row, col), [onPress, row, col]);

  const starColor = hasError ? theme.starErrorColor : theme.starColor;

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.cell,
        {
          width: size,
          height: size,
          backgroundColor: theme.cellBg,
          borderTopWidth: borders.top ? REGION_BORDER_WIDTH : INNER_BORDER_WIDTH,
          borderBottomWidth: borders.bottom ? REGION_BORDER_WIDTH : INNER_BORDER_WIDTH,
          borderLeftWidth: borders.left ? REGION_BORDER_WIDTH : INNER_BORDER_WIDTH,
          borderRightWidth: borders.right ? REGION_BORDER_WIDTH : INNER_BORDER_WIDTH,
          borderStyle: INNER_BORDER_STYLE,
          borderTopColor: borders.top ? theme.regionBorder : theme.innerBorder,
          borderBottomColor: borders.bottom
            ? theme.regionBorder
            : theme.innerBorder,
          borderLeftColor: borders.left
            ? theme.regionBorder
            : theme.innerBorder,
          borderRightColor: borders.right
            ? theme.regionBorder
            : theme.innerBorder,
        },
      ]}
    >
      {value === 1 && (
        <Text style={[styles.star, { fontSize: size * 0.5, color: starColor }]}>
          ★
        </Text>
      )}
      {value === 2 && (
        <Text
          style={[
            styles.mark,
            { fontSize: size * 0.4, color: theme.markColor },
          ]}
        >
          ✕
        </Text>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  star: {
    fontWeight: '700',
  },
  mark: {
    fontWeight: '300',
  },
});
```

Star rendering uses the ★ unicode character. If this looks bad on device, swap for an SVG icon later. Start simple.

---

## Step 5: Game State (Zustand Store)

The puzzle store owns all mutable game state. Components subscribe to slices via selectors. This gives us cell-level re-renders — when one cell changes, only that cell (and auto-X neighbors) re-render. The board itself never re-renders.

Tap order is **empty → mark → star → empty**. The mark-first cycle matches how players naturally solve: eliminate cells first, then place stars.

Undo uses a **move log**, not full-board snapshots. Each move records the tapped cell's previous value and any auto-X side effects. On undo, the changes are replayed in reverse. A typical move is 1-9 entries (the tap + up to 8 neighbors). Compare to a full snapshot of a 25x25 board: 625 entries per move.

### `src/store.ts`

```typescript
import { create } from 'zustand';
import { triggerHaptic } from './haptics';
import { getProgress, saveProgress, getSettings } from './storage';
import type { CellValue, Progress, Move, CellChange } from './types/state';
import type { Puzzle } from './types/puzzle';

type PuzzleState = {
  // Puzzle data
  puzzle: Puzzle | null;
  boardSize: number;

  // Cell state
  cells: CellValue[];
  errorCells: Set<string>;

  // Game state
  completed: boolean;
  timeMs: number;
  moveLog: Move[];

  // Actions
  loadPuzzle: (puzzle: Puzzle) => void;
  tapCell: (row: number, col: number) => void;
  undo: () => void;
  tick: () => void;
};

export const usePuzzleStore = create<PuzzleState>((set, get) => ({
  puzzle: null,
  boardSize: 0,
  cells: [],
  errorCells: new Set(),
  completed: false,
  timeMs: 0,
  moveLog: [],

  loadPuzzle: puzzle => {
    const total = puzzle.size * puzzle.size;
    const saved = getProgress(puzzle.id);
    set({
      puzzle,
      boardSize: puzzle.size,
      cells: saved ? saved.cells : new Array(total).fill(0),
      errorCells: new Set(),
      completed: saved?.completed ?? false,
      timeMs: saved?.timeMs ?? 0,
      moveLog: [],
    });
  },

  tapCell: (row, col) => {
    const { cells, boardSize, completed, puzzle } = get();
    if (completed || !puzzle) return;

    const settings = getSettings();
    const idx = row * boardSize + col;
    const current = cells[idx];

    // Build move log entry
    const changes: CellChange[] = [];
    const newCells = [...cells];

    // Cycle: 0 (empty) -> 2 (mark) -> 1 (star) -> 0 (empty)
    const next: CellValue = current === 0 ? 2 : current === 2 ? 1 : 0;
    changes.push({ index: idx, previousValue: current });
    newCells[idx] = next;

    // Auto-X neighbors when placing a star
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

    // Auto-X completed rows/columns/regions when placing a star
    if (next === 1 && settings.autoXRowsCols) {
      // Check if row now has all required stars
      let rowStars = 0;
      for (let c = 0; c < boardSize; c++) {
        if (newCells[row * boardSize + c] === 1) rowStars++;
      }
      if (rowStars === puzzle.stars) {
        for (let c = 0; c < boardSize; c++) {
          const rIdx = row * boardSize + c;
          if (newCells[rIdx] === 0) {
            changes.push({ index: rIdx, previousValue: newCells[rIdx] });
            newCells[rIdx] = 2;
          }
        }
      }

      // Check if column now has all required stars
      let colStars = 0;
      for (let r = 0; r < boardSize; r++) {
        if (newCells[r * boardSize + col] === 1) colStars++;
      }
      if (colStars === puzzle.stars) {
        for (let r = 0; r < boardSize; r++) {
          const cIdx = r * boardSize + col;
          if (newCells[cIdx] === 0) {
            changes.push({ index: cIdx, previousValue: newCells[cIdx] });
            newCells[cIdx] = 2;
          }
        }
      }

      // Check if region now has all required stars
      const placedRegion = puzzle.regions[row][col];
      let regionStars = 0;
      for (let r = 0; r < boardSize; r++) {
        for (let c = 0; c < boardSize; c++) {
          if (puzzle.regions[r][c] === placedRegion && newCells[r * boardSize + c] === 1) {
            regionStars++;
          }
        }
      }
      if (regionStars === puzzle.stars) {
        for (let r = 0; r < boardSize; r++) {
          for (let c = 0; c < boardSize; c++) {
            if (puzzle.regions[r][c] === placedRegion) {
              const regIdx = r * boardSize + c;
              if (newCells[regIdx] === 0) {
                changes.push({ index: regIdx, previousValue: newCells[regIdx] });
                newCells[regIdx] = 2;
              }
            }
          }
        }
      }
    }

    if (settings.haptics) triggerHaptic('impactLight');

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
    if (
      playerStars.length === solutionSet.size &&
      playerStars.every(s => solutionSet.has(s))
    ) {
      if (settings.haptics) triggerHaptic('notificationSuccess');
      set({ completed: true });
    }

    // Persist
    persistProgress(get());
  },

  undo: () => {
    const { moveLog, cells } = get();
    if (moveLog.length === 0) return;

    const lastMove = moveLog[moveLog.length - 1];
    const newCells = [...cells];

    // Replay changes in reverse
    for (let i = lastMove.changes.length - 1; i >= 0; i--) {
      const { index, previousValue } = lastMove.changes[i];
      newCells[index] = previousValue;
    }

    const settings = getSettings();
    if (settings.haptics) triggerHaptic('impactLight');

    set({
      cells: newCells,
      moveLog: moveLog.slice(0, -1),
    });
    persistProgress(get());
  },

  tick: () => {
    const { completed } = get();
    if (completed) return;
    set(state => ({ timeMs: state.timeMs + 1000 }));
  },
}));

function persistProgress(state: PuzzleState): void {
  if (!state.puzzle) return;
  const progress: Progress = {
    puzzleId: state.puzzle.id,
    cells: state.cells,
    timeMs: state.timeMs,
    completed: state.completed,
    completedAt: state.completed ? Date.now() : undefined,
    updatedAt: Date.now(),
  };
  saveProgress(progress);
}
```

---

## Step 6: Game Screen (Puzzle Screen)

The puzzle gameplay screen. Uses React Navigation's standard header. Game logic lives in the Zustand store — this screen is mostly wiring.

Layout: the board area fills the screen (for zooming and panning). The toolbar floats at the bottom with absolute positioning. The win banner slides up from the bottom over everything.

### `src/utils/formatTime.ts`

```typescript
export function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
```

### `src/screens/PuzzleScreen.tsx`

Uses RN's built-in `Animated` API for the win banner slide-up spring animation. Wires `BoardView`, `Toolbar`, store actions, timer interval, and navigation header.

See `src/screens/PuzzleScreen.tsx` for the full implementation.

### `src/haptics.ts`

```typescript
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

type HapticType = 'impactLight' | 'impactMedium' | 'notificationSuccess';

export function triggerHaptic(type: HapticType): void {
  ReactNativeHapticFeedback.trigger(type, {
    enableVibrateFallback: true,
    ignoreAndroidSystemSettings: false,
  });
}
```

### `src/components/Toolbar.tsx`

Two buttons: zoom reset and undo. Lucide icons, no text labels. Absolutely positioned near the bottom of the screen so it floats over the board area.

The zoom reset button is disabled (grayed out) when the board is at default zoom. When pressed, it triggers a smooth spring animation back to default scale and position.

```tsx
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Undo2, Minimize2 } from 'lucide-react-native';
import { useTheme } from '../theme';

type Props = {
  onUndo: () => void;
  canUndo: boolean;
  completed: boolean;
  isZoomed: boolean;
  onZoomReset: () => void;
};

export function Toolbar({
  onUndo,
  canUndo,
  completed,
  isZoomed,
  onZoomReset,
}: Props) {
  const theme = useTheme();
  const undoDisabled = !canUndo || completed;
  const zoomDisabled = !isZoomed;

  return (
    <View style={styles.toolbar}>
      <Pressable
        onPress={onZoomReset}
        disabled={zoomDisabled}
        style={[
          styles.button,
          { backgroundColor: theme.card },
          zoomDisabled && styles.disabled,
        ]}
      >
        <Minimize2 size={20} color={theme.text} />
      </Pressable>

      <Pressable
        onPress={onUndo}
        disabled={undoDisabled}
        style={[
          styles.button,
          { backgroundColor: theme.card },
          undoDisabled && styles.disabled,
        ]}
      >
        <Undo2 size={20} color={theme.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  disabled: { opacity: 0.3 },
});
```

---

## Step 7: Navigation

Three screens: Home, Pack Detail, and Puzzle. Stack navigator. Home screen has no header. Pack and Puzzle screens use standard React Navigation headers with icon-only back buttons (no text labels).

### `src/navigation.tsx`

```tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from './screens/HomeScreen';
import { PackScreen } from './screens/PackScreen';
import { PuzzleScreen } from './screens/PuzzleScreen';

export type RootStackParams = {
  Home: undefined;
  Pack: { packId: string };
  Puzzle: { packId: string; puzzleIndex: number };
};

const Stack = createNativeStackNavigator<RootStackParams>();

export function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="Pack" component={PackScreen} />
        <Stack.Screen name="Puzzle" component={PuzzleScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

Home header is hidden — the home screen manages its own layout. Pack and Puzzle screens use standard headers with back buttons handled automatically by React Navigation. Back buttons use `headerBackButtonDisplayMode: 'minimal'` for icon-only display. Screen titles set dynamically via `navigation.setOptions` in each screen.

---

## Step 8: Home Screen

Shows the list of puzzle packs with completion progress.

Uses `useFocusEffect` to re-render when the screen gains focus — this ensures completion counts update immediately when navigating back from a completed puzzle, since progress is read synchronously from MMKV during render but FlatList doesn't know the underlying data changed.

### `src/screens/HomeScreen.tsx`

```tsx
import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getAllPacks } from '../packs';
import { getPackProgress } from '../storage';
import { useTheme } from '../theme';
import type { Pack } from '../types/puzzle';
import type { RootStackParams } from '../navigation';

type Props = NativeStackScreenProps<RootStackParams, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const packs = getAllPacks();
  const theme = useTheme();

  // Force re-render on focus so completion counts stay fresh
  const [, setFocusCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusCount(c => c + 1);
    }, []),
  );

  const renderPack = ({ item }: { item: Pack }) => {
    const packProgress = getPackProgress(item.id);
    const completed = packProgress.completedPuzzleIds.length;
    const total = item.puzzles.length;

    return (
      <Pressable
        style={[styles.packCard, { backgroundColor: theme.card }]}
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
      keyExtractor={p => p.id}
      renderItem={renderPack}
      contentContainerStyle={styles.list}
      style={{ backgroundColor: theme.bg }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  packCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  packInfo: { flex: 1 },
  packName: { fontSize: 18, fontWeight: '600' },
  packMeta: { fontSize: 14, marginTop: 4 },
  packProgress: { fontSize: 16, fontWeight: '600' },
});
```

---

## Step 9: Pack Screen (Puzzle Selection)

Grid of puzzle cells within a pack. Shows completion state for each.

Same `useFocusEffect` pattern as HomeScreen to ensure completion state updates on back navigation.

### `src/screens/PackScreen.tsx`

```tsx
import React, { useCallback, useState } from 'react';
import { Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getPack } from '../packs';
import { getProgress } from '../storage';
import { useTheme } from '../theme';
import type { RootStackParams } from '../navigation';

type Props = NativeStackScreenProps<RootStackParams, 'Pack'>;

export function PackScreen({ route, navigation }: Props) {
  const { packId } = route.params;
  const pack = getPack(packId);
  const theme = useTheme();

  // Force re-render on focus so completion states stay fresh
  const [, setFocusCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusCount(c => c + 1);
    }, []),
  );

  React.useEffect(() => {
    if (pack) navigation.setOptions({ title: pack.name });
  }, [pack, navigation]);

  if (!pack) return null;

  const renderPuzzle = ({ index }: { item: any; index: number }) => {
    const puzzleId = `${packId}:${index}`;
    const progress = getProgress(puzzleId);
    const isCompleted = progress?.completed ?? false;

    return (
      <Pressable
        style={[
          styles.puzzleCell,
          { backgroundColor: isCompleted ? theme.accent + '20' : theme.card },
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
      keyExtractor={(_, i) => String(i)}
      renderItem={renderPuzzle}
      numColumns={5}
      contentContainerStyle={styles.grid}
      style={{ backgroundColor: theme.bg }}
    />
  );
}

const styles = StyleSheet.create({
  grid: { padding: 16 },
  puzzleCell: {
    flex: 1,
    aspectRatio: 1,
    margin: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  puzzleNumber: { fontSize: 18, fontWeight: '600' },
});
```

---

## Step 10: Theme + Wire Up App.tsx

### `src/theme.ts`

Follow system theme by default. Light/dark only. All component colors reference theme values — no hardcoded color strings in components.

```typescript
import { useColorScheme } from 'react-native';
import { getSettings } from './storage';

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
};

const light: Theme = {
  bg: '#FAFAFA',
  card: '#FFFFFF',
  text: '#1A1A1A',
  textSecondary: '#888888',
  regionBorder: '#000000',
  innerBorder: '#CCCCCC',
  cellBg: '#FFFFFF',
  starColor: '#F9A825',
  starErrorColor: '#EF4444',
  markColor: '#9E9E9E',
  accent: '#4CAF50',
};

const dark: Theme = {
  bg: '#121212',
  card: '#1E1E1E',
  text: '#E0E0E0',
  textSecondary: '#888888',
  regionBorder: '#CCCCCC',
  innerBorder: '#444444',
  cellBg: '#2A2A2A',
  starColor: '#FFD54F',
  starErrorColor: '#F87171',
  markColor: '#757575',
  accent: '#66BB6A',
};

export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const settings = getSettings();

  if (settings.theme === 'light') return light;
  if (settings.theme === 'dark') return dark;
  return systemScheme === 'dark' ? dark : light;
}
```

Thread `useTheme()` through all components. No hardcoded colors in components — everything references theme values.

### `App.tsx`

Replace the stock template.

```tsx
import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Navigation } from './src/navigation';

export default function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <Navigation />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

---

## Todo List

### Phase 1: Playable Game

This plan covers Phase 1. Every task below maps to a step above.

#### Step 1: Dependencies

- [x] Install runtime deps: `react-native-mmkv`, `react-native-haptic-feedback`, `react-native-gesture-handler`, `zustand`, `lucide-react-native`, `react-native-nitro-modules`
- [x] Run `cd ios && pod install && cd ..`
- [x] Verify clean build on iOS simulator
- [x] Verify clean build on Android emulator

#### Step 2: Types and Data Layer

- [x] Create `src/types/` directory
- [x] Create `src/types/puzzle.ts` — `Coord`, `RawPuzzle`, `Puzzle`, `Pack`, `Borders`
- [x] Create `src/types/state.ts` — `CellValue`, `Progress`, `UserSettings`, `PackProgress`, `CellChange`, `Move`
- [x] Create `src/storage.ts` — MMKV instance via `createMMKV`, `DEFAULT_SETTINGS`, `getSettings`, `saveSettings`, `getProgress`, `saveProgress`, `getPackProgress`, `markPuzzleCompleted`
- [x] Create `src/packs.ts` — static JSON imports, `getAllPacks()`, `getPack(id)`
- [x] Confirm Metro resolves JSON imports from `/packs/` without config changes

#### Step 3: Puzzle Parser

- [x] Create `src/puzzle-parser.ts` — `parsePuzzle(raw, puzzleId)` → `Puzzle`
- [x] Manually verify parser output against a known puzzle (check regions grid, size, stars, solution)

#### Step 4: Board Renderer

- [x] Create `src/constants/board.ts` — `CELL_SIZE`, `REGION_BORDER_WIDTH`, `INNER_BORDER_WIDTH`, `INNER_BORDER_STYLE`
- [x] Create `src/components/CellView.tsx` — memo'd component, Zustand cell-level subscription, border rendering, theme colors, star/mark/empty states, error star color
- [x] Create `src/components/BoardView.tsx` — cell grid with `flexWrap`, pre-computed `cellBorders` memo, pinch gesture, pan gesture, `Gesture.Simultaneous`, RN `Animated` transforms, zoom reset via ref, `onZoomChange` callback
- [ ] Render a puzzle on device to visually verify grid, region borders, cell sizing

#### Step 5: Game State

- [x] Create `src/haptics.ts` — `triggerHaptic` wrapper
- [x] Create `src/store.ts` — Zustand store with `PuzzleState` type
- [x] Implement `loadPuzzle` — parse saved progress or initialize empty cells
- [x] Implement `tapCell` — mark-first cycle (empty → mark → star → empty)
- [x] Implement `autoXNeighbors` — mark 8 adjacent empty cells when placing a star
- [x] Implement `autoXRowsCols` — mark remaining empty cells in row, column, and region when star count reaches required count
- [x] Implement move log — record `CellChange[]` for tapped cell and all auto-X side effects
- [x] Implement `undo` — pop last move, restore all `previousValue`s in reverse
- [x] Implement `tick` — increment `timeMs` by 1000 when not completed
- [x] Implement win detection — compare placed stars against solution set
- [x] Implement `persistProgress` — save to MMKV after every tap and undo
- [x] Implement haptic feedback — `impactLight` on tap/undo, `notificationSuccess` on win

#### Step 6: Game Screen

- [x] Create `src/utils/formatTime.ts` — `formatTime(ms)` → `"M:SS"`
- [x] Create `src/components/Toolbar.tsx` — zoom reset (`Minimize2`) and undo (`Undo2`) buttons, absolute positioning, disabled states
- [x] Create `src/screens/PuzzleScreen.tsx` — wire `BoardView`, `Toolbar`, store actions, timer interval, navigation header with title and timer, zoom reset ref coordination
- [x] Implement win banner — `Animated.View` that slides up with spring animation on completion, shows "Solved!", time, and "Continue" button

#### Step 7: Navigation

- [x] Create `src/navigation.tsx` — `RootStackParams` type, `createNativeStackNavigator`, three screens
- [x] Configure Home with `headerShown: false`
- [x] Configure global `headerBackButtonDisplayMode: 'minimal'`

#### Step 8: Home Screen

- [x] Create `src/screens/HomeScreen.tsx` — `FlatList` of packs
- [x] Render pack cards with name, grid size, and completion count (`completed/total`)
- [x] Implement `useFocusEffect` to force re-render on back navigation

#### Step 9: Pack Screen

- [x] Create `src/screens/PackScreen.tsx` — `FlatList` grid (`numColumns={5}`) of puzzle cells
- [x] Render puzzle number with completed/incomplete styling
- [x] Set screen title dynamically from pack name
- [x] Implement `useFocusEffect` to force re-render on back navigation

#### Step 10: Theme + Wire Up App.tsx

- [x] Create `src/theme.ts` — `Theme` type (11 color properties), `light` and `dark` objects, `useTheme()` hook respecting system/user preference
- [x] Replace `App.tsx` — `GestureHandlerRootView` > `SafeAreaProvider` > `StatusBar` > `Navigation`
- [ ] Verify light theme renders correctly
- [ ] Verify dark theme renders correctly
- [ ] Verify system theme switching works

#### End-to-End Validation

- [ ] Play through intro pack puzzle 1 start to finish
- [ ] Verify undo reverts tap + auto-X neighbors in one step
- [ ] Verify win detection triggers on correct solution
- [ ] Verify win banner animation
- [ ] Verify progress persists across app restart
- [ ] Verify completion state shows on pack screen and home screen after back navigation
- [ ] Verify pinch-to-zoom and pan on 8x8 and 10x10 boards
- [ ] Verify zoom reset button works
- [ ] Test on physical iOS device
- [ ] Test on physical Android device

---

### Phase 2: Retention (post-Phase 1)

Daily habit formation. Still local-only.

- [ ] Daily puzzle — serve from pre-generated set
- [ ] Daily streak tracking — local, UTC-based
- [ ] Hint button — free, unlimited, reads pre-computed hint metadata from puzzle data
- [ ] Pack progression tracking
- [ ] Error highlighting toggle
- [ ] Privacy policy (required before store submission)

### Phase 3: Monetization (post-Phase 2)

- [ ] Terms of service
- [ ] Unlock-all-puzzles IAP (one-time purchase)
- [ ] RevenueCat integration (client-side receipt validation)
- [ ] App Store submission

### Phase 4: Cloud (conditional — post-Phase 3)

Only if Phases 1-3 prove retention and revenue.

- [ ] Shared types package
- [ ] Cloudflare Worker + D1 database
- [ ] BetterAuth integration
- [ ] Rate limiting on auth endpoints
- [ ] Cloud sync (last-write-wins)
- [ ] R2 puzzle storage for paid packs
- [ ] Paid puzzle packs
- [ ] RevenueCat webhook with HMAC verification
- [ ] Purchase recovery flow
