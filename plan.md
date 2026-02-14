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
npm install react-native-mmkv react-native-haptic-feedback react-native-gesture-handler react-native-reanimated zustand lucide-react-native
cd ios && pod install && cd ..
```

**react-native-mmkv** — fast key-value storage for puzzle progress and settings. Crash-safe, synchronous reads.

**react-native-haptic-feedback** — tap feedback on cell cycles and win detection.

**react-native-gesture-handler** — already a transitive dependency of React Navigation but we need it explicitly for tap handling, pinch-to-zoom, and pan gestures on the board.

**react-native-reanimated** — UI-thread animations for pinch-to-zoom transforms, pan gestures, and the win banner slide-up. Required by the Gesture API (v2) from gesture-handler.

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
  autoX: boolean;
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

// One player action (tap). Contains the tapped cell change plus any auto-X cells that were marked as a side effect. On undo, iterate changes in reverse and restore each previousValue.
export type Move = {
  changes: CellChange[];
};
```

<!-- Auto x Neighbors and auto x rows/columns need to be seperate optiosn in user settings, ont eh settings UI screen, and perfrom different action ont eh baord editor, auto x neighbors is default on. Auto x rows/columns is deafult off. -->

### `src/storage.ts`

Thin wrapper over MMKV. All reads are synchronous. All writes are fire-and-forget (MMKV is crash-safe).

```typescript
import { MMKV } from 'react-native-mmkv';
import type { UserSettings, Progress, PackProgress } from './types/state';

const storage = new MMKV();

const KEYS = {
  settings: 'user_settings',
  progress: (puzzleId: string) => `progress:${puzzleId}`,
  packProgress: (packId: string) => `pack_progress:${packId}`,
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
  introData as Pack,
  fiveStar as Pack,
  sixStar as Pack,
  eightStar as Pack,
  tenStar as Pack,
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

### `src/components/BoardView.tsx`

```tsx
import React, { useMemo, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { CellView } from './CellView';
import type { Puzzle, Borders } from '../types/puzzle';

type Props = {
  puzzle: Puzzle;
  onCellPress: (row: number, col: number) => void;
  zoomResetRef?: React.MutableRefObject<(() => void) | null>;
  onZoomChange?: (isZoomed: boolean) => void;
};

const CELL_SIZE = 38;

export function BoardView({
  puzzle,
  onCellPress,
  zoomResetRef,
  onZoomChange,
}: Props) {
  const boardSize = CELL_SIZE * puzzle.size;

  // Zoom and pan state (UI thread via reanimated)
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Expose zoom reset to parent via ref
  const resetZoom = useCallback(() => {
    scale.value = withSpring(1);
    savedScale.value = 1;
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    onZoomChange?.(false);
  }, []);

  if (zoomResetRef) zoomResetRef.current = resetZoom;

  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      savedScale.value = Math.max(1, Math.min(scale.value, 3));
      scale.value = withSpring(savedScale.value);
      onZoomChange?.(savedScale.value !== 1);
    });

  const panGesture = Gesture.Pan()
    .onUpdate(e => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composed = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // Pre-compute border info for each cell (only runs when puzzle changes)
  const cellBorders = useMemo(() => {
    const borders: Borders[] = [];
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
    <GestureDetector gesture={composed}>
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
              size={CELL_SIZE}
              borders={borders}
              onPress={onCellPress}
            />
          );
        })}
      </Animated.View>
    </GestureDetector>
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

<!-- as we are in development and i plan on iterating/making board style very customizable, can you make sure the variabels for board style design like Border Width, Border COlor, Inner Border Width, innder Boarder Dashes, inner baorder color, cell size are all variabels that we can easily adjust client side. The cell size is a good start -->

### `src/components/CellView.tsx`

Each cell subscribes to its own slice of the Zustand store. When cell 42 changes, only cell 42 (and its auto-X neighbors) re-render. The board never re-renders.

Each cell renders its own borders. The `borders` prop tells the cell which edges are region boundaries (3px, theme region color) vs inner grid lines (1px, theme inner color).

Errors are shown by changing the star color to red. Cell background stays the same — no background color changes for errors.

```tsx
import React, { memo, useCallback } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { usePuzzleStore } from '../store';
import { useTheme } from '../theme';
import type { Borders } from '../types/puzzle';

const REGION_BORDER = 3;
const INNER_BORDER = 1;

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
          borderTopWidth: borders.top ? REGION_BORDER : INNER_BORDER,
          borderBottomWidth: borders.bottom ? REGION_BORDER : INNER_BORDER,
          borderLeftWidth: borders.left ? REGION_BORDER : INNER_BORDER,
          borderRightWidth: borders.right ? REGION_BORDER : INNER_BORDER,
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

<!-- again on the autoX neighbors and autoX rows/columns, same rules shoudl apply and seperate fucntiosn should exist - neighbors and rows/columns caused by the sr palcement are removed when the star is removed. -->

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

```tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BoardView } from '../components/BoardView';
import { Toolbar } from '../components/Toolbar';
import { parsePuzzle } from '../puzzle-parser';
import { getPack } from '../packs';
import { usePuzzleStore } from '../store';
import { useTheme } from '../theme';
import { formatTime } from '../utils/formatTime';
import type { RootStackParams } from '../navigation';

type Props = NativeStackScreenProps<RootStackParams, 'Puzzle'>;

export function PuzzleScreen({ route, navigation }: Props) {
  const { packId, puzzleIndex } = route.params;
  const pack = getPack(packId);
  const rawPuzzle = pack?.puzzles[puzzleIndex];
  const theme = useTheme();

  const loadPuzzle = usePuzzleStore(s => s.loadPuzzle);
  const tapCell = usePuzzleStore(s => s.tapCell);
  const undo = usePuzzleStore(s => s.undo);
  const tick = usePuzzleStore(s => s.tick);
  const completed = usePuzzleStore(s => s.completed);
  const timeMs = usePuzzleStore(s => s.timeMs);
  const canUndo = usePuzzleStore(s => s.moveLog.length > 0);
  const puzzle = usePuzzleStore(s => s.puzzle);

  // Zoom reset coordination between board and toolbar
  const zoomResetRef = useRef<(() => void) | null>(null);
  const [isZoomed, setIsZoomed] = React.useState(false);

  // Win banner slide-up animation
  const bannerTranslateY = useSharedValue(200);
  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bannerTranslateY.value }],
  }));

  // Load puzzle into store
  useEffect(() => {
    if (!rawPuzzle || !pack) return;
    const puzzleId = `${packId}:${puzzleIndex}`;
    const parsed = parsePuzzle(rawPuzzle, puzzleId);
    loadPuzzle(parsed);
  }, [rawPuzzle, pack, packId, puzzleIndex, loadPuzzle]);

  // Timer
  useEffect(() => {
    if (completed) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [completed, tick]);

  // Animate win banner on completion
  useEffect(() => {
    if (completed) {
      bannerTranslateY.value = withSpring(0);
    } else {
      bannerTranslateY.value = 200;
    }
  }, [completed]);

  // Configure navigation header
  useEffect(() => {
    navigation.setOptions({
      title: pack?.name ?? '',
      headerRight: () => (
        <Text style={[styles.timer, { color: theme.textSecondary }]}>
          {formatTime(timeMs)}
        </Text>
      ),
    });
  }, [navigation, pack, timeMs, theme]);

  if (!puzzle) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.boardArea}>
        <BoardView
          puzzle={puzzle}
          onCellPress={tapCell}
          zoomResetRef={zoomResetRef}
          onZoomChange={setIsZoomed}
        />
      </View>

      <Toolbar
        onUndo={undo}
        canUndo={canUndo}
        completed={completed}
        isZoomed={isZoomed}
        onZoomReset={() => zoomResetRef.current?.()}
      />

      {completed && (
        <Animated.View
          style={[
            styles.winBanner,
            { backgroundColor: theme.accent },
            bannerStyle,
          ]}
        >
          <Text style={styles.winText}>Solved!</Text>
          <Text style={styles.winTime}>{formatTime(timeMs)}</Text>
          <Text onPress={() => navigation.goBack()} style={styles.nextButton}>
            Continue
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  boardArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  timer: { fontSize: 16, fontVariant: ['tabular-nums'] },
  winBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
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
          headerBackTitleVisible: false,
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

Home header is hidden — the home screen manages its own layout. Pack and Puzzle screens use standard headers with back buttons handled automatically by React Navigation. Back buttons show only the chevron icon, no text label. Screen titles set dynamically via `navigation.setOptions` in each screen.

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
