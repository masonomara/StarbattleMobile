# StarbattleMobile — Codebase Review

**Date:** 2026-05-17  
**Reviewer:** Claude Code  
**Branch:** main  
**Last commit:** 2c791a0

---

## What This App Is

StarbattleMobile is a React Native puzzle game implementing the **Star Battle** logic puzzle — think Sudoku but you place stars on a grid such that every row, column, and colored region contains exactly N stars, and no two stars are adjacent (including diagonally).

The app uses bare React Native CLI, TypeScript throughout, targeting iOS. It ships with bundled puzzle packs plus daily/weekly/monthly rotating challenges with a streak system.

---

## Tech Stack

| Layer | Library | Version |
|---|---|---|
| Framework | React Native CLI | RN 0.84.0, React 19.2.3 |
| Language | TypeScript | 5.8.3 |
| Navigation | React Navigation (native-stack) | 7.x |
| State | Zustand | 5.0.11 |
| Storage | react-native-mmkv | 4.1.2 |
| Gestures | react-native-gesture-handler | 2.30.0 |
| Graphics | react-native-svg | 15.15.3 |
| Icons | lucide-react-native | 0.564.0 |
| Haptics | react-native-haptic-feedback | 2.3.3 |

Dependency versions are modern and well-chosen. MMKV is the right call over AsyncStorage for a game (synchronous reads, much faster).

---

## Project Structure

```text
/
├── App.tsx                   # Root: initializes userStore, wraps providers
├── src/
│   ├── navigation.tsx        # Stack navigator: Home → Pack → Puzzle
│   ├── store.ts              # Main puzzle game state (Zustand)
│   ├── storage.ts            # MMKV abstraction layer
│   ├── packs.ts              # Pack/puzzle data loader
│   ├── components/           # Reusable UI components
│   ├── hooks/                # Custom hooks (zoom, draw gesture, theme)
│   ├── screens/              # Navigation destinations
│   ├── stores/               # Secondary Zustand stores
│   ├── types/                # All TypeScript types (per CLAUDE.md rule)
│   └── utils/                # Pure utility functions
├── packs/                    # Bundled puzzle JSON data
│   ├── intro.json
│   ├── 1star-5x5.json
│   ├── 1star-6x6.json
│   ├── 1star-8x8.json
│   ├── 2star-10x10.json
│   ├── daily.json
│   ├── weekly.json
│   └── monthly.json
└── sieve/                    # Legacy puzzle generation engine (superseded — see below)
```

The `src/types/` convention from CLAUDE.md is consistently followed — all types live there, not alongside their consumers.

---

## Navigation Flow

```text
HomeScreen
  ├── → PackScreen (for standard packs)
  │     └── → PuzzleScreen
  └── → PuzzleScreen (directly for daily/weekly/monthly streaks)
```

Three screens, simple stack. No tab bar. Transitions are native-stack defaults.

---

## Data Model

### Puzzle Format (SBN — Space-Battle Notation)

Puzzles are serialized as compact strings like `"5x1.DDCCADBCCAEBCCAEEEEAEEEEE"`:

- Header: `{size}x{starCount}` — e.g. `5x1` means 5×5 grid, 1 star per row/col/region
- Layout: Region letters in row-major order (A–Z), one character per cell
- Solution: Array of `[row, col]` coordinates
- Hints: Array of solver steps with rule name, difficulty level, and cell lists

### Core Types

```text
RawPuzzle → parsePuzzle() → Puzzle
  Puzzle: { size, stars, regions[][], solution[][], hints[] }

Pack: { id, name, gridSize, stars, puzzles[], free }

CellValue: 0 (empty) | 1 (star) | 2 (marked/X)

Progress: { cells[][], autoMarks, timeMs, completed }

Move: { before, after, autoMarksBefore, autoMarksAfter }  // for undo/redo
```

---

## State Architecture

### Two Zustand Stores

**`src/store.ts`** — Puzzle game state (ephemeral per session):

- `cells`, `autoMarks`, `errorCells`
- `moveLog`, `redoStack` (undo/redo)
- `hintGhosts` (visual hint overlay)
- `completed`, `timeMs`
- Actions: `tapCell`, `applyDrawStroke`, `undo`, `redo`, `showHint`, `clearBoard`, `loadPuzzle`, `recomputeAutoMarks`

**`src/stores/userStore.ts`** — Persistent user state:

- Settings (`autoX*`, `highlightErrors`, `showTimer`, `hideToolbar`, `theme`, `haptics`)
- Completed puzzle set + per-pack counts
- Streaks (daily/weekly/monthly)
- Actions: `initialize`, `updateSettings`, `saveProgress`, `recordStreak`

This separation is correct — game session state vs. persistent user data should not live in the same store.

### Data Flow

```text
User touch → gesture handler → store action → MMKV persist → Zustand notify → React re-render
```

### Cell Tap Logic (`store.ts: tapCell`)

The tap cycles through states contextually:

- Default mode: empty → marked → star → empty
- Erase mode: anything → empty

On each tap:

1. Updates `cells`
2. Recomputes `autoMarks` based on settings
3. Recomputes `errorCells` (if highlighting enabled)
4. Appends to `moveLog`, clears `redoStack`
5. Triggers haptics
6. Checks win condition

Auto-X modes (three independent toggles):

- `autoXNeighbors`: marks all 8 adjacent cells when a star is placed
- `autoXRowsCols`: marks remaining cells in row/col when that line is saturated
- `autoXRegions`: marks remaining cells in a region when it's saturated

---

## Gesture System

### Zoom + Pan (`src/hooks/useZoom.ts`)

- Pinch-to-zoom: 0.67× – 3× scale range, spring-animated
- Pan: boundary-clamped so board stays on screen
- Gesture state tracked with shared Reanimated values

### Draw Gesture (`src/hooks/useDrawGesture.ts`)

- 150ms long-press activation threshold
- Drag to continuously place or erase across cells
- Computes cell from touch coordinates accounting for zoom/pan transform
- Batches all changes from one drag into a single `Move` (single undo step)
- Uses `applyDrawStroke()` to commit

Both gestures are composed together in `PuzzleScreen` and applied to `BoardView`.

---

## Board Rendering

```text
BoardView
  ├── CellView × (size × size)     — individual cells, memoized
  ├── CellGridSvg                  — thin grid lines (SVG overlay)
  └── RegionBordersSvg             — thick region borders (SVG overlay)
```

**CellView** renders stars and X-marks as SVG paths. Ghost versions (from hints) use reduced opacity.

**RegionBordersSvg** computes which edges are region boundaries and draws thick lines. Encoding borders as SVG segments rather than per-cell borders avoids layout thrash.

**Performance:** CellView is memoized. Store subscriptions use `useShallow` for selector stability. This prevents full re-renders on unrelated state changes.

---

## Persistence

**`src/storage.ts`** wraps MMKV with typed getters/setters:

| Key | Value |
|---|---|
| `local:settings` | Serialized `UserSettings` |
| `local:streaks` | Serialized `Streak` |
| `local:progress:{puzzleId}` | Serialized `Progress` |

Progress autosaves every 5 seconds while a puzzle is active (interval in `PuzzleScreen`). Saves also fire on explicit events (win, board clear).

---

## Streak System

Three independent streak tracks: daily, weekly, monthly.

Each uses a time-based key to identify the current period:

- Daily: `YYYY-MM-DD`
- Weekly: `YYYY-WXX` (ISO week)
- Monthly: `YYYY-MM`

Streak increments only if the previous completion was the immediately prior period. Gap = reset to 1. The active puzzle for each period rotates by `epoch mod packSize`, so all users see the same puzzle each day/week/month.

---

## Puzzle Pack Data

7 packs bundled as JSON. Each pack has:

- `id`, `name`, `gridSize`, `stars`, `free` flag
- Array of puzzles (each with `sbn`, `solution`, `hints`)

Pack unlock: sequential by default — puzzle N is locked until N-1 is complete. Premium accounts unlock everything (see Issues).

---

## Hint System

Hints are pre-computed solver steps stored in each puzzle's JSON. On `showHint()`:

1. Finds the first hint step not yet fully satisfied by current cell state
2. Displays rule name in toolbar
3. Shows ghost overlays (faded star/X) on affected cells
4. Dismissed on next cell tap

The hints come from the solver — the same rules it used to solve the puzzle become the hint steps shown to the user.

---

## Puzzle Generation

The `/sieve` folder at the project root is a legacy Node.js TypeScript puzzle generator. It is **not bundled into the app** and has been superseded by a Rust-based generator maintained at [`github.com/masonomara/star-battle` (rust branch)](https://github.com/masonomara/star-battle/tree/rust). The bundled `packs/*.json` files were produced by the old sieve; future packs will come from the Rust system.

---

## UI / Theming

`src/hooks/useTheme.ts` returns a theme object from a `'system' | 'light' | 'dark'` setting.

| Token | Light | Dark |
|---|---|---|
| background | `#FFFFFF` | `#1C1D23` |
| text | `#060607` | `#EBEDEF` |
| accent | `#5865F2` | `#5865F2` |
| mark (X) | `#B52C21` | `#F57970` |

Cell sizing: base 32px, scaled from screen dimensions. Grid fits screen width.

---

## Screens

### HomeScreen

- Shows daily/weekly/monthly streak challenges at top
- Lists all packs with `X / N completed` counts
- Tapping a pack → PackScreen; tapping a streak → PuzzleScreen directly

### PackScreen

- 5-column grid of numbered puzzle buttons
- Locked puzzles: grayed out (no tap)
- Completed puzzles: checkmark icon
- Active (unlocked, incomplete): solid tap target

### PuzzleScreen

- Full-screen puzzle board
- Absolutely positioned Header (back button, puzzle title, timer, settings)
- Toolbar at bottom (zoom reset, hint, mode toggle, undo, redo, clear)
- `WinBanner` appears on completion with time or streak count
- "Next puzzle" button navigates forward; home button goes back to PackScreen

---

## Settings

`SettingsModal` (full-screen overlay):

- **Auto-X Neighbors** toggle
- **Auto-X Rows/Cols** toggle
- **Auto-X Regions** toggle
- **Highlight Errors** toggle
- **Show Timer** toggle
- **Hide Toolbar** toggle
- **Haptic Feedback** toggle
- **Theme** selector (System / Light / Dark)

All settings persist immediately to MMKV via `userStore.updateSettings()`. Changes to auto-X settings trigger `recomputeAutoMarks()` on the active puzzle.

---

## What's Working Well

- **Architecture is clean.** Two-store split (game vs. user) is correct. Types are centralized per the project rule. No barrel exports enforced by CLAUDE.md.
- **Gesture implementation is solid.** Pinch-zoom with spring physics, boundary-clamped pan, and the draw gesture with transform-aware coordinate math.
- **Undo/redo is properly designed.** `Move` objects capture before/after state including auto-marks. Redo stack is cleared on new moves. Undo is disabled after win.
- **Hint system is elegant.** Hints are solver steps baked into puzzle data at generation time — no runtime solver needed on device.
- **MMKV is the right persistence choice.** Synchronous, fast, type-safe via the storage abstraction.
- **Memoization is applied correctly.** CellView memoized, `useShallow` on selectors — the hot path (rendering N² cells) is protected.

---

## Issues & Observations

### 1. Load ordering between userStore and puzzle state

`src/store.ts` is a module-level singleton. If `loadPuzzle()` is called before `userStore.initialize()` completes reading from MMKV, auto-mark settings won't be applied correctly to the initial cell state. There's no explicit synchronization between the two stores on startup.

### 2. Progress saving needs a full redesign

The current approach — 5-second MMKV interval in `PuzzleScreen` — is the weakest part of the architecture. On a rebuild this needs to be torn down completely and rethought around:

- What gets saved **locally** (offline play, available without an account)
- What gets synced **to the cloud** (cross-device progress, requires account)
- What is available **with vs. without** a paid account
- How local-first sync works when a user goes back online after offline play

Needs to be fast, simple, and designed for the account model before any implementation.

### 3. Streak puzzle rotation is deterministic but not communicated

The active daily/weekly/monthly puzzle is `epoch mod packSize`. All users see the same puzzle each period. Nothing in the UI communicates this. Intentional design decision, just worth documenting explicitly.

### 4. Account and permission architecture is unplanned

Sequential pack unlock and the `Pack.free` flag are both intentional: free-tier users progress linearly, premium accounts unlock everything. The issue is that the account/permission system doesn't exist yet. This is the primary architectural gap that needs design before any of the following can be implemented:

- Free vs. premium access tiers
- Per-pack purchases vs. subscription
- Unlocking packs vs. unlocking individual puzzles
- How access state persists and syncs alongside puzzle progress

This needs a dedicated planning session before touching the codebase.

### 5. No error boundaries

No React error boundaries exist anywhere in the component tree. A crash in `PuzzleScreen` (e.g., malformed puzzle data hitting the SVG renderer) propagates to the root and crashes the app. At minimum, `PuzzleScreen` needs a boundary with graceful fallback.

### 6. SBN parsing has no validation

`src/utils/parsePuzzle.ts` will throw at runtime on malformed input. Since puzzles are bundled this is low-blast-radius today, but once puzzles can be fetched or user-generated, unvalidated parsing becomes a crash vector. Input validation should be added before any server-side puzzle delivery.

---

## Files to Revisit First

| File | Why |
|---|---|
| `src/store.ts` | Heart of game logic — most complex file |
| `src/screens/PuzzleScreen.tsx` | Wires everything together; gesture setup + lifecycle |
| `src/hooks/useDrawGesture.ts` | Complex coordinate math; easy to break subtly |
| `src/utils/puzzleLogic.ts` | Error detection and win check — any rule changes start here |
| `packs/*.json` | Content — future packs generated by the Rust system |

---

## Quick Reference: Key Conventions

- All types → `src/types/`
- No barrel `index.ts` exports
- Puzzle data → `packs/*.json` (new packs via Rust generator, not `/sieve`)
- Persistence → MMKV via `src/storage.ts` (never use AsyncStorage)
- State → Zustand (puzzle store + user store only)
- Theming → `useTheme()` hook, not inline color strings
- Gestures → compose from `useZoom` + `useDrawGesture` hooks

---

## Overall Direction

This version is the **beta**. The gameplay loop, navigation structure, and UI are solid — good enough to ship in their current form. The two issues that warrant a clean alpha restart rather than incremental patches:

1. **Account and payment architecture.** The app has no concept of user identity or entitlements. Free vs. premium tier, pack unlocking, and access-gated features all need to be designed from scratch and built as a foundation before anything else touches permissions or progression.

2. **Storage redesign.** The current local-only MMKV model can't support cloud sync, cross-device progress, or account-gated content. The new model needs to be designed around offline-first with cloud sync, clearly separating what lives locally vs. in the cloud and what requires an account.

Everything else — gameplay, gestures, hint system, rendering — carries forward as-is.
