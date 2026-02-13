# Implementation Plan: Star Battle Mobile (Phase 1)

Local-only playable game. No server, no auth, no sync, no purchases, no ads.

---

## What Exists

- **Solver engine** in `/sieve/` — 38 production rules, 999/1000 solve rate, own package.json and test suite
- **5 puzzle packs** in `/packs/` — intro (5x5), 1star-5x5, 1star-6x6, 1star-8x8, 2star-10x10. Each has 30 puzzles with pre-computed hints and solutions
- **React Native 0.84.0** scaffold — bare (not Expo), React 19.2.3, React Navigation installed (native + native-stack), safe area context, screens. `src/` is empty. App.tsx is stock template.
- **Types defined** in `docs/specs/GEN-types.md` — PackFile, Puzzle, HintStep, PuzzleProgress, UserSettings, all stable

## What We're Building

Everything a player needs to download the app, open it, pick a puzzle, play it through, use hints, and come back for more. Organized as 10 implementation steps.

---

## Step 1: Dependencies

Install what we need. Nothing else.

```bash
npm install react-native-mmkv react-native-haptic-feedback react-native-gesture-handler zustand
cd ios && pod install && cd ..
```

**react-native-mmkv** — fast key-value storage for puzzle progress and settings. Crash-safe, synchronous reads.

**react-native-haptic-feedback** — tap feedback on cell cycles and win detection.

**react-native-gesture-handler** — already a transitive dependency of React Navigation but we need it explicitly for tap handling and pinch-to-zoom on the board.

**zustand** — lightweight state management with selectors. Each cell subscribes to its own slice of state, so tapping one cell only re-renders that cell (and its auto-X neighbors), not the entire board.

No animation library (use RN Animated). No other dependencies.

---

## Step 2: Types and Data Layer

All types live in `src/types/`. Every type definition in the app goes here — no inline type exports from component or utility files.

### `src/types/puzzle.ts`

The puzzle data types. `GamePuzzle` is the single puzzle representation the app works with — SBN is parsed at pack-load time so nothing downstream ever sees raw encoded strings. `Pack` holds metadata plus an array of parsed `GamePuzzle`s.

```typescript
export type Coord = [number, number];

export type HintStep = {
  rule: string;
  level: number;
  placements: Coord[];
  marks: Coord[];
};

export type GamePuzzle = {
  id: string;
  size: number;
  stars: number;
  regions: number[][];
  solution: Coord[];
  hints: HintStep[];
};

export type Pack = {
  id: string;
  name: string;
  gridSize: number;
  stars: number;
  puzzles: GamePuzzle[];
};
```

### `src/types/state.ts`

Runtime and persisted state types.

```typescript
export type CellValue = 0 | 1 | 2; // 0=empty, 1=star, 2=marked

export type PuzzleProgress = {
  puzzleId: string; // "{packId}:{index}"
  cells: CellValue[]; // flat array, length = gridSize²
  timeMs: number;
  completed: boolean;
  completedAt?: number; // unix ms
  hintsUsed: number;
  currentHintIndex: number;
  updatedAt: number; // unix ms
};

export type UserSettings = {
  autoX: boolean;
  highlightErrors: boolean;
  showTimer: boolean;
  theme: 'system' | 'light' | 'dark';
  haptics: boolean;
};

// A single cell change within a move. Records what was there before
// so undo can restore it.
export type CellChange = {
  index: number; // flat index into cells array
  previousValue: CellValue;
};

// One player action (tap). Contains the tapped cell change plus any
// auto-X cells that were marked as a side effect. On undo, iterate
// changes in reverse and restore each previousValue.
// Cost: ~1-9 entries per move (tapped cell + up to 8 auto-X neighbors).
// Compare to full-board snapshots: 625 entries for a 25x25 board.
export type Move = {
  changes: CellChange[];
};
```

### `src/types/index.ts`

Barrel export.

```typescript
export * from './puzzle';
export * from './state';
```

### `src/storage.ts`

Thin wrapper over MMKV. All reads are synchronous. All writes are fire-and-forget (MMKV is crash-safe).

```typescript
import { MMKV } from 'react-native-mmkv';
import type { UserSettings, PuzzleProgress } from './types';

const storage = new MMKV();

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
import type { PackFile } from './types';

const PACKS: PackFile[] = [
  introData as PackFile,
  fiveStar as PackFile,
  sixStar as PackFile,
  eightStar as PackFile,
  tenStar as PackFile,
];

export function getAllPacks(): PackFile[] {
  return PACKS;
}

export function getPack(id: string): PackFile | undefined {
  return PACKS.find(p => p.id === id);
}
```

Total bundled size: ~294KB of JSON. Negligible in an app binary.

---

## Step 3: Puzzle Parser

The app works with `GamePuzzle` objects, not raw SBN strings or raw pack JSON. SBN is a compact notation for the generator/solver — the mobile app needs a fully-parsed structure that combines the grid layout, solution, and hints into one object.

### `src/puzzle-parser.ts`

```typescript
import type { Puzzle, GamePuzzle } from './types';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Takes a raw puzzle from pack JSON and produces the object the app works with.
export function parsePuzzle(raw: Puzzle, puzzleId: string): GamePuzzle {
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
    hints: raw.hints,
  };
}
```

One function, one output type. Everything the app needs for gameplay is in the returned `GamePuzzle`.

---

## Step 4: Board Renderer

The core visual. A grid of cells where each cell owns its own border rendering.

### Architecture

- `BoardView` — the container. Wraps the cell grid in a pinch-to-zoom gesture handler. Computes cell size once from screen width and grid size.
- `CellView` — one cell. Renders content (empty, star icon, X mark) and its own borders. Each cell determines its border widths and colors based on whether its neighbors belong to the same region. Inner borders: 1px dark gray. Region borders: 3px black.
- Cell size is constant (computed once). Does not change during gameplay. Players can pinch-to-zoom with two fingers for larger boards.

### `src/components/BoardView.tsx`

```tsx
import React, { useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { PinchGestureHandler } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { CellView } from './CellView';
import type { GamePuzzle } from '../types';

type Props = {
  puzzle: GamePuzzle;
  onCellPress: (row: number, col: number) => void;
};

const BOARD_PADDING = 16;

export function BoardView({ puzzle, onCellPress }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const boardSize = screenWidth - BOARD_PADDING * 2;
  const cellSize = boardSize / puzzle.size;

  // Pinch-to-zoom
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const pinchHandler = useAnimatedGestureHandler({
    onActive: event => {
      scale.value = savedScale.value * event.scale;
    },
    onEnd: () => {
      savedScale.value = Math.max(1, Math.min(scale.value, 3));
      scale.value = savedScale.value;
    },
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Pre-compute border info for each cell (only runs when puzzle changes)
  const cellBorders = useMemo(() => {
    const borders: {
      top: boolean;
      bottom: boolean;
      left: boolean;
      right: boolean;
    }[] = [];
    for (let row = 0; row < puzzle.size; row++) {
      for (let col = 0; col < puzzle.size; col++) {
        const region = puzzle.regions[row][col];
        borders.push({
          top: row === 0 || puzzle.regions[row - 1][col] !== region,
          bottom:
            row === puzzle.size - 1 || puzzle.regions[row + 1][col] !== region,
          left: col === 0 || puzzle.regions[row][col - 1] !== region,
          right:
            col === puzzle.size - 1 || puzzle.regions[row][col + 1] !== region,
        });
      }
    }
    return borders;
  }, [puzzle]);

  return (
    <PinchGestureHandler onGestureEvent={pinchHandler}>
      <Animated.View
        style={[
          styles.board,
          { width: boardSize, height: boardSize },
          animatedStyle,
        ]}
      >
        {cellBorders.map((borders, i) => {
          const row = Math.floor(i / puzzle.size);
          const col = i % puzzle.size;
          return (
            <CellView
              key={i}
              row={row}
              col={col}
              size={cellSize}
              borders={borders}
              onPress={onCellPress}
            />
          );
        })}
      </Animated.View>
    </PinchGestureHandler>
  );
}

const styles = StyleSheet.create({
  board: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
```

### `src/components/CellView.tsx`

Each cell subscribes to its own slice of the Zustand store. When cell 42 changes, only cell 42 (and its auto-X neighbors) re-render. The board never re-renders.

Each cell renders its own borders. The `borders` prop tells the cell which edges are region boundaries (3px black) vs inner grid lines (1px dark gray).

```tsx
import React, { memo, useCallback } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { usePuzzleStore } from '../store';

type Borders = {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
};

type Props = {
  row: number;
  col: number;
  size: number;
  borders: Borders;
  onPress: (row: number, col: number) => void;
};

const REGION_BORDER = 3;
const INNER_BORDER = 1;
const REGION_COLOR = '#000000';
const INNER_COLOR = '#CCCCCC';

export const CellView = memo(function CellView({
  row,
  col,
  size,
  borders,
  onPress,
}: Props) {
  const value = usePuzzleStore(s => s.cells[row * s.boardSize + col]);
  const hasError = usePuzzleStore(s => s.errorCells.has(`${row},${col}`));

  const handlePress = useCallback(() => onPress(row, col), [onPress, row, col]);

  const bgColor = hasError ? '#FFCDD2' : '#FFFFFF';

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.cell,
        {
          width: size,
          height: size,
          backgroundColor: bgColor,
          borderTopWidth: borders.top ? REGION_BORDER : INNER_BORDER,
          borderBottomWidth: borders.bottom ? REGION_BORDER : INNER_BORDER,
          borderLeftWidth: borders.left ? REGION_BORDER : INNER_BORDER,
          borderRightWidth: borders.right ? REGION_BORDER : INNER_BORDER,
          borderTopColor: borders.top ? REGION_COLOR : INNER_COLOR,
          borderBottomColor: borders.bottom ? REGION_COLOR : INNER_COLOR,
          borderLeftColor: borders.left ? REGION_COLOR : INNER_COLOR,
          borderRightColor: borders.right ? REGION_COLOR : INNER_COLOR,
        },
      ]}
    >
      {value === 1 && (
        <Text style={[styles.star, { fontSize: size * 0.5 }]}>★</Text>
      )}
      {value === 2 && (
        <Text style={[styles.mark, { fontSize: size * 0.4 }]}>✕</Text>
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
    color: '#F9A825',
    fontWeight: '700',
  },
  mark: {
    color: '#9E9E9E',
    fontWeight: '300',
  },
});
```

Star rendering uses the ★ unicode character. If this looks bad on device, swap for an SVG icon later. Start simple.

---

## Step 5: Game State (Zustand Store)

The puzzle store owns all mutable game state. Components subscribe to slices via selectors. This gives us cell-level re-renders — when one cell changes, only that cell (and auto-X neighbors) re-render. The board itself never re-renders.

Undo uses a **move log**, not full-board snapshots. Each move records the tapped cell's previous value and any auto-X side effects. On undo, the changes are replayed in reverse. A typical move is 1-9 entries (the tap + up to 8 neighbors). Compare to a full snapshot of a 25x25 board: 625 entries per move.

### `src/store.ts`

```typescript
import { create } from 'zustand';
import { triggerHaptic } from './haptics';
import { getProgress, saveProgress, getSettings } from './storage';
import type {
  CellValue,
  GamePuzzle,
  PuzzleProgress,
  Move,
  CellChange,
} from './types';

type PuzzleState = {
  // Puzzle data
  puzzle: GamePuzzle | null;
  boardSize: number;

  // Cell state
  cells: CellValue[];
  errorCells: Set<string>;

  // Game state
  completed: boolean;
  timeMs: number;
  hintsUsed: number;
  currentHintIndex: number;
  moveLog: Move[];

  // Actions
  loadPuzzle: (puzzle: GamePuzzle) => void;
  tapCell: (row: number, col: number) => void;
  undo: () => void;
  requestHint: () => void;
  tick: () => void;
};

export const usePuzzleStore = create<PuzzleState>((set, get) => ({
  puzzle: null,
  boardSize: 0,
  cells: [],
  errorCells: new Set(),
  completed: false,
  timeMs: 0,
  hintsUsed: 0,
  currentHintIndex: 0,
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
      hintsUsed: saved?.hintsUsed ?? 0,
      currentHintIndex: saved?.currentHintIndex ?? 0,
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

    // Cycle: 0 -> 1 -> 2 -> 0
    const next: CellValue = current === 0 ? 1 : current === 1 ? 2 : 0;
    changes.push({ index: idx, previousValue: current });
    newCells[idx] = next;

    // Auto-X when placing a star
    if (next === 1 && settings.autoX) {
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

  requestHint: () => {
    const { completed, puzzle, currentHintIndex, cells, boardSize } = get();
    if (completed || !puzzle) return;

    for (let i = currentHintIndex; i < puzzle.hints.length; i++) {
      const hint = puzzle.hints[i];
      const allApplied = [...hint.placements, ...hint.marks].every(
        ([r, c]) => cells[r * boardSize + c] !== 0,
      );
      if (!allApplied) {
        set(state => ({
          currentHintIndex: i,
          hintsUsed: state.hintsUsed + 1,
        }));
        return hint;
      }
    }
    return null;
  },

  tick: () => {
    const { completed } = get();
    if (completed) return;
    set(state => ({ timeMs: state.timeMs + 1000 }));
  },
}));

function persistProgress(state: PuzzleState): void {
  if (!state.puzzle) return;
  const progress: PuzzleProgress = {
    puzzleId: state.puzzle.id,
    cells: state.cells,
    timeMs: state.timeMs,
    completed: state.completed,
    completedAt: state.completed ? Date.now() : undefined,
    hintsUsed: state.hintsUsed,
    currentHintIndex: state.currentHintIndex,
    updatedAt: Date.now(),
  };
  saveProgress(progress);
}
```

---

## Step 6: Game Screen (Puzzle Screen)

The puzzle gameplay screen. Uses React Navigation's standard header. Game logic lives in the Zustand store — this screen is mostly wiring.

### `src/screens/PuzzleScreen.tsx`

```tsx
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BoardView } from '../components/BoardView';
import { Toolbar } from '../components/Toolbar';
import { parsePuzzle } from '../puzzle-parser';
import { getPack } from '../packs';
import { usePuzzleStore } from '../store';
import type { RootStackParams } from '../navigation';

type Props = NativeStackScreenProps<RootStackParams, 'Puzzle'>;

export function PuzzleScreen({ route, navigation }: Props) {
  const { packId, puzzleIndex } = route.params;
  const pack = getPack(packId);
  const rawPuzzle = pack?.puzzles[puzzleIndex];

  const loadPuzzle = usePuzzleStore(s => s.loadPuzzle);
  const tapCell = usePuzzleStore(s => s.tapCell);
  const undo = usePuzzleStore(s => s.undo);
  const requestHint = usePuzzleStore(s => s.requestHint);
  const tick = usePuzzleStore(s => s.tick);
  const completed = usePuzzleStore(s => s.completed);
  const timeMs = usePuzzleStore(s => s.timeMs);
  const canUndo = usePuzzleStore(s => s.moveLog.length > 0);
  const puzzle = usePuzzleStore(s => s.puzzle);

  // Load puzzle into store
  useEffect(() => {
    if (!rawPuzzle || !pack) return;
    const puzzleId = `${packId}:${puzzleIndex}`;
    const gamePuzzle = parsePuzzle(rawPuzzle, puzzleId);
    loadPuzzle(gamePuzzle);
  }, [rawPuzzle, pack, packId, puzzleIndex, loadPuzzle]);

  // Timer
  useEffect(() => {
    if (completed) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [completed, tick]);

  // Configure navigation header
  useEffect(() => {
    navigation.setOptions({
      title: pack?.name ?? '',
      headerRight: () => <Text style={styles.timer}>{formatTime(timeMs)}</Text>,
    });
  }, [navigation, pack, timeMs]);

  if (!puzzle) return null;

  return (
    <View style={styles.container}>
      <BoardView puzzle={puzzle} onCellPress={tapCell} />

      <Toolbar
        onUndo={undo}
        onHint={requestHint}
        canUndo={canUndo}
        completed={completed}
      />

      {completed && (
        <View style={styles.winBanner}>
          <Text style={styles.winText}>Solved!</Text>
          <Text style={styles.winTime}>{formatTime(timeMs)}</Text>
          <Text onPress={() => navigation.goBack()} style={styles.nextButton}>
            Continue
          </Text>
        </View>
      )}
    </View>
  );
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  timer: { fontSize: 16, fontVariant: ['tabular-nums'], color: '#666' },
  winBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#4CAF50',
    padding: 24,
    alignItems: 'center',
  },
  winText: { fontSize: 28, fontWeight: '700', color: '#FFF' },
  winTime: { fontSize: 16, color: '#FFF', marginTop: 4 },
  nextButton: {
    fontSize: 16,
    color: '#FFF',
    marginTop: 12,
    textDecorationLine: 'underline',
  },
});
```

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

```tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

type Props = {
  onUndo: () => void;
  onHint: () => void;
  canUndo: boolean;
  completed: boolean;
};

export function Toolbar({ onUndo, onHint, canUndo, completed }: Props) {
  return (
    <View style={styles.toolbar}>
      <Pressable
        onPress={onUndo}
        disabled={!canUndo || completed}
        style={[styles.button, (!canUndo || completed) && styles.disabled]}
      >
        <Text style={styles.buttonText}>Undo</Text>
      </Pressable>

      <Pressable
        onPress={onHint}
        disabled={completed}
        style={[styles.button, completed && styles.disabled]}
      >
        <Text style={styles.buttonText}>Hint</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 16,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
  },
  disabled: { opacity: 0.4 },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#333' },
});
```

---

## Step 7: Navigation

Three screens: Home, Pack Detail, and Puzzle. Stack navigator with standard React Navigation headers.

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
      <Stack.Navigator>
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'Star Battle' }}
        />
        <Stack.Screen name="Pack" component={PackScreen} />
        <Stack.Screen name="Puzzle" component={PuzzleScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

Standard headers with back buttons handled automatically by React Navigation. Screen titles set via `options` or dynamically via `navigation.setOptions` in each screen.

---

## Step 8: Home Screen

Shows the list of puzzle packs with completion progress.

### `src/screens/HomeScreen.tsx`

```tsx
import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getAllPacks } from '../packs';
import { getPackCompletionCount } from '../storage';
import type { PackFile } from '../types';
import type { RootStackParams } from '../navigation';

type Props = NativeStackScreenProps<RootStackParams, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const packs = getAllPacks();

  const renderPack = ({ item }: { item: PackFile }) => {
    const completed = getPackCompletionCount(item.id, item.puzzles.length);
    const total = item.puzzles.length;

    return (
      <Pressable
        style={styles.packCard}
        onPress={() => navigation.navigate('Pack', { packId: item.id })}
      >
        <View style={styles.packInfo}>
          <Text style={styles.packName}>{item.name}</Text>
          <Text style={styles.packMeta}>
            {item.gridSize}x{item.gridSize} · {item.stars}{' '}
            {item.stars === 1 ? 'star' : 'stars'}
          </Text>
        </View>
        <Text style={styles.packProgress}>
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
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  packCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF',
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
  packName: { fontSize: 18, fontWeight: '600', color: '#333' },
  packMeta: { fontSize: 14, color: '#888', marginTop: 4 },
  packProgress: { fontSize: 16, fontWeight: '600', color: '#4CAF50' },
});
```

---

## Step 9: Pack Screen (Puzzle Selection)

Grid of puzzle cells within a pack. Shows completion state for each.

### `src/screens/PackScreen.tsx`

```tsx
import React from 'react';
import { Text, Pressable, FlatList, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getPack } from '../packs';
import { getProgress } from '../storage';
import type { RootStackParams } from '../navigation';

type Props = NativeStackScreenProps<RootStackParams, 'Pack'>;

export function PackScreen({ route, navigation }: Props) {
  const { packId } = route.params;
  const pack = getPack(packId);

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
        style={[styles.puzzleCell, isCompleted && styles.completed]}
        onPress={() =>
          navigation.navigate('Puzzle', { packId, puzzleIndex: index })
        }
      >
        <Text
          style={[styles.puzzleNumber, isCompleted && styles.completedText]}
        >
          {index + 1}
        </Text>
        {isCompleted && <Text style={styles.checkmark}>✓</Text>}
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
    />
  );
}

const styles = StyleSheet.create({
  grid: { padding: 16 },
  puzzleCell: {
    flex: 1,
    aspectRatio: 1,
    margin: 6,
    backgroundColor: '#FFF',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  completed: { backgroundColor: '#E8F5E9' },
  puzzleNumber: { fontSize: 18, fontWeight: '600', color: '#333' },
  completedText: { color: '#4CAF50' },
  checkmark: { fontSize: 12, color: '#4CAF50', marginTop: 2 },
});
```

---

## Step 10: Theme + Wire Up App.tsx

### `src/theme.ts`

Follow system theme by default. Light/dark only (midnight cut from v1).

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
  markColor: string;
  accent: string;
  error: string;
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
  markColor: '#9E9E9E',
  accent: '#4CAF50',
  error: '#FFCDD2',
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
  markColor: '#757575',
  accent: '#66BB6A',
  error: '#4E342E',
};

export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const settings = getSettings();

  if (settings.theme === 'light') return light;
  if (settings.theme === 'dark') return dark;
  return systemScheme === 'dark' ? dark : light;
}
```

Thread `useTheme()` through all components. Replace hardcoded colors with theme values.

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

## File Structure

```
src/
  types/
    index.ts            # Barrel export
    puzzle.ts           # Coord, HintStep, Puzzle, PackFile, GamePuzzle
    state.ts            # CellValue, PuzzleProgress, UserSettings, Move, CellChange
  store.ts              # Zustand puzzle store (cells, undo, win, hints)
  storage.ts            # MMKV wrapper
  packs.ts              # Pack loading (dev/test, will be replaced)
  puzzle-parser.ts      # SBN parsing + GamePuzzle assembly
  haptics.ts            # Haptic wrapper
  theme.ts              # Light/dark theme
  navigation.tsx        # Stack navigator
  screens/
    HomeScreen.tsx       # Pack list
    PackScreen.tsx       # Puzzle grid within a pack
    PuzzleScreen.tsx     # The game
  components/
    BoardView.tsx        # Grid container + pinch-to-zoom + border pre-computation
    CellView.tsx         # Single cell (Zustand selector, own borders)
    Toolbar.tsx          # Undo + Hint buttons
```

---

## Build Order

Strictly sequential. Each step is testable before moving to the next.

| #   | What                                                                | Testable By                             |
| --- | ------------------------------------------------------------------- | --------------------------------------- |
| 1   | Install deps (mmkv, haptics, gesture-handler, zustand), pod install | App builds and runs                     |
| 2   | Types + storage + pack loading                                      | Console.log a pack, read/write MMKV     |
| 3   | Puzzle parser                                                       | Parse intro.json puzzle, log GamePuzzle |
| 4   | BoardView + CellView (with borders)                                 | Render a static board on screen         |
| 5   | Zustand store (tap, auto-X, undo, win, hints)                       | Play a full puzzle to completion        |
| 6   | PuzzleScreen wiring (timer, header, win banner)                     | Full puzzle gameplay loop               |
| 7   | Navigation stack                                                    | Navigate between screens                |
| 8   | HomeScreen                                                          | See all packs with progress             |
| 9   | PackScreen                                                          | See all puzzles, tap to play            |
| 10  | Theme + App.tsx                                                     | Toggle system dark mode, full flow      |

---

## Key Design Decisions

**Zustand with selectors.** Each CellView subscribes to its own index in the store. When cell 42 changes, only cell 42 (and its auto-X neighbors) re-renders. The board never re-renders. This is the right tool for a grid of 100+ independently-updating cells.

**No redo.** Undo only. Redo adds complexity for minimal user benefit in a puzzle game. The user can just re-tap.

**Move log for undo.** Each move records only the cells that changed and their previous values. A typical move is 1-9 entries (the tap + up to 8 auto-X neighbors). On undo, replay in reverse. This is far lighter than full-board snapshots — a 25x25 board snapshot would be 625 entries per move; a move log entry is usually under 10.

**Win detection compares star positions, not the full grid.** The solution array only stores star coordinates. Comparing 10-20 coordinates is instant and avoids false negatives from unmarked cells.

**Hints don't auto-apply.** The spec says show faded marks, let the user confirm. This maintains the learning loop — the player sees the deduction and must internalize it.

**Timer uses setInterval(1000).** Good enough for a puzzle timer. No need for sub-second precision. Persisted to MMKV on every cell change.

**Borders on cells, not an overlay.** Each cell renders its own borders based on whether adjacent cells share its region. Border info is pre-computed once in BoardView when the puzzle loads and passed as a static prop. No extra rendering layer.

**App works with GamePuzzle, not SBN.** SBN is a compact notation for the generator. The app parses it once via `parsePuzzle()` into a `GamePuzzle` with size, stars, regions, solution, and hints as flat fields. Nothing else in the app touches SBN directly.

---

## What This Plan Doesn't Cover (Intentionally)

- Daily/weekly/monthly puzzles — Phase 2
- Streak tracking — Phase 2
- Settings screen — can be added after core flow works
- IAP / RevenueCat — Phase 3
- Cloud sync — Phase 4
- The missing 3star-14x14 pack — content pipeline
- Hint explanation text (the templates from GEN-types.md) — enhancement after hints work visually
- Production pack delivery system — will replace the static import loader
- Player color annotations (cell highlighting with colors) — future enhancement

---

## Risk: Large Board Performance

10x10 = 100 cells. 14x14 = 196 cells. Zustand selectors handle this well — each cell only re-renders when its own value changes. Border info is pre-computed and passed as static props — no per-cell recalculation.

If pinch-to-zoom performance is an issue on very large boards (14x14+), the fallback is react-native-skia for canvas-based rendering. Cross that bridge when it's a measured problem. The intro pack (5x5, 25 cells) and even 10x10 (100 cells) will be fine.

---

## Task List

Every task needed to ship Phase 1. Grouped by step. Complete in order — each step is testable before starting the next.

### Step 1: Dependencies

- [x] Install `react-native-mmkv` (v4 w/ `react-native-nitro-modules` peer dep)
- [x] Install `react-native-haptic-feedback`
- [x] Install `react-native-gesture-handler` (explicit, not just transitive)
- [x] ~~Install `react-native-reanimated`~~ — skipped, incompatible with RN 0.84. Using RN's built-in Animated API instead
- [x] Install `zustand`
- [x] Run `pod install`
- [ ] Verify clean build on iOS simulator
- [ ] Verify clean build on Android emulator

### Step 2: Types and Data Layer

- [x] Create `src/types/puzzle.ts` — `Coord`, `HintStep`, `GamePuzzle`, `Pack` (inlined raw puzzle shape, no separate Puzzle type)
- [x] Create `src/types/state.ts` — `CellValue`, `PuzzleProgress`, `UserSettings`, `CellChange`, `Move` (no erroneous import)
- [x] Create `src/types/index.ts` — barrel export
- [x] Create `src/storage.ts` — MMKV wrapper using `createMMKV()` (v4 API)
- [x] Create `src/packs.ts` — loads and parses all 5 packs at import time, exports `Pack[]` with `GamePuzzle[]`
- [ ] Verify MMKV reads/writes work on device

### Step 3: Puzzle Parser

- [x] Create `src/puzzle-parser.ts` — `parsePuzzle()` function
- [x] Parse SBN header, layout, build `GamePuzzle`
- [x] Parsing happens at pack-load time — app never sees raw SBN

### Step 4: Board Renderer

- [x] Create `src/components/CellView.tsx` — memo'd, Zustand selector per cell, region color bg, themed borders
- [x] Create `src/components/BoardView.tsx` — pre-computed borders + region colors, pinch-to-zoom + pan (RN Animated), light/dark region palettes
- [ ] Verify: render a static 5x5 board on screen with correct borders and region colors

### Step 5: Game State (Zustand Store)

- [x] Create `src/store.ts` — `usePuzzleStore` with all actions
- [x] Settings loaded once from MMKV at init, stored in Zustand state
- [x] `activeHint` stored as state, not returned from action
- [x] Win check gated behind `next === 1`
- [x] moveLog capped at 100 entries
- [x] `persistProgress` debounced (500ms trailing)
- [ ] Verify: load puzzle, tap, undo, win, persist

### Step 6: Game Screen

- [x] Create `src/haptics.ts`
- [x] Create `src/components/Toolbar.tsx` — themed, disabled states
- [x] Create `src/screens/PuzzleScreen.tsx` — timer, header, win banner
- [x] Create `src/utils.ts` — `formatTime` extracted as shared util

### Step 7: Navigation

- [x] Create `src/navigation.tsx` — native stack with Home, Pack, Puzzle screens

### Step 8: Home Screen

- [x] Create `src/screens/HomeScreen.tsx` — FlatList, themed, completion counts memoized via `useMemo`

### Step 9: Pack Screen

- [x] Create `src/screens/PackScreen.tsx` — puzzle grid, themed, completion checkmarks

### Step 10: Theme + App.tsx

- [x] Create `src/theme.ts` — light/dark themes, `useTheme()` reads from Zustand settings
- [x] Theme threaded through all components and screens
- [x] App.tsx replaced — `GestureHandlerRootView` + `SafeAreaProvider` + `Navigation`
- [x] TypeScript compiles clean (`npx tsc --noEmit` passes)

### Fixes from Review (all addressed)

- [x] ~~`react-native-reanimated`~~ — dropped, using RN Animated
- [x] Dead `CellValue` import — never existed in implementation
- [x] Pinch-to-zoom — using RN Animated + RNGH handlers (PinchGestureHandler + PanGestureHandler with simultaneousHandlers)
- [x] Region shading — light/dark palettes, 26 colors each
- [x] Settings in Zustand store — read from MMKV once on init
- [x] `activeHint` as state
- [x] Win check gated behind `next === 1`
- [x] moveLog capped at 100
- [x] `persistProgress` debounced 500ms
- [x] `formatTime` in `src/utils.ts`
- [x] HomeScreen completion counts memoized
