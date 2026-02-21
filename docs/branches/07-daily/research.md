# Codebase Research Report

## What the App Is

A React Native Star Battle puzzle game. Star Battle is a logic puzzle where you place stars on a grid. The app ships with 5 puzzle packs of increasing difficulty and provides a full solve-and-track experience.


## Data Flow

1. **Pack JSON → parsePuzzle** — SBN string decoded into regions/size/stars
2. **loadPuzzle** — Checks MMKV for saved progress, initializes cells/autoMarks/time/completed
3. **User taps cell → tapCell** — Cycles cell value (empty→mark→star→empty or erase mode), computes auto-X marks, checks errors, checks win, persists
4. **Win detected → completed = true** — WinBanner slides up, timer stops
5. **persistProgress** — Writes Progress to MMKV via userStore.saveProgress, which also updates completedPuzzles/completedPerPack sets

### Puzzle ID Format
`"{packId}:{puzzleIndex}"` — e.g., `"intro:0"`, `"1star-5x5:14"`

### Storage Key Format
`"local:progress:{puzzleId}"` — e.g., `"local:progress:intro:0"`

---

## How Packs Work Today

- 5 packs are statically imported as JSON at build time in `src/packs.ts`
- The `packs` array is the single source of truth consumed everywhere
- Puzzle unlock is sequential within a pack (must complete puzzle N-1 to unlock puzzle N)
- No concept of daily/weekly/monthly challenges
- No concept of streaks
- No server-side puzzle delivery yet

---

## Observations Relevant to Daily/Weekly/Monthly Challenges

### What Exists
- Puzzle parsing, rendering, interaction, and persistence are all solid and decoupled
- `parsePuzzle` can parse any RawPuzzle into a playable Puzzle, regardless of source
- Progress is keyed by a string puzzleId — flexible enough for any naming scheme
- The store's loadPuzzle is pack-agnostic — it just needs a Puzzle object
- WinBanner already accepts props for what to show post-completion

### What's Missing
- **Challenge concept**: No type, data structure, or storage for daily/weekly/monthly challenges
- **Challenge navigation**: HomeScreen only shows the pack list. No challenge preview cards above it.
- **Challenge puzzle source**: All puzzles come from static pack imports. No mechanism to fetch or select a puzzle by date/week/month.
- **Streak tracking**: No streak data in Progress or UserSettings. WinBanner has no streak display.
- **Challenge-specific win flow**: WinBanner navigates within a pack. Challenges need different post-win behavior (show streak, return to home).

### Coupling / Interdependency Notes
- `packs` array is imported directly in `HomeScreen`, `PackScreen`, `PuzzleScreen`, and `userStore`. If challenges use a different source, those screens don't need to change — we'd just pass puzzle data through navigation params.
- `usePuzzleStore` is fully generic. It doesn't care where the Puzzle came from.
- `persistProgress` and `userStore.saveProgress` track by puzzleId string. Challenge puzzles just need unique IDs (e.g., `"daily:2026-02-21"`).
- `computeCompletedCount` and `buildProgress` in userStore only scan static packs. Challenge progress needs its own tracking.

### Potential Complexities
- HomeScreen needs a new section above the pack list for challenge previews
- PuzzleScreen navigation currently expects `packId` + `puzzleIndex` route params — challenge puzzles need a different entry path
- WinBanner is tightly coupled to pack navigation (next puzzle in same pack) — challenges need a different post-win action
- The timer interval in PuzzleScreen is coupled to the same persist flow — fine as-is if challenge puzzles use the same puzzleId-based storage

---

## Sieve (Solver Engine)

Located in `/sieve/`, excluded from tsconfig. Separate package. Contains:
- A puzzle **generator** that creates random Star Battle grids
- A **solver** that applies human-like deduction rules (11 rule categories, ~30+ individual rules) to produce step-by-step solutions with difficulty ratings
- A **pack generator** that batches puzzles into JSON packs
- Rules are organized by difficulty level (1-11): star neighbors → forced placements → trivial marks → tiling enumeration → counting → tiling pairs → tiling counting → hypotheticals → propagated hypotheticals

The sieve is how the pack JSONs were created. It generates SBN strings, solutions, hints, and difficulty metrics.

---

## Code Health Assessment

**Clean areas:**
- Types are centralized in `src/types/` as required
- No barrel exports
- Store logic is well-separated (puzzle store vs user store)
- Puzzle logic is pure functions in utils
- SVG rendering is memo'd and performant
- Theme system is simple and consistent

**Areas to watch:**
- `computeCompletedCount` in storage.ts is unused (buildProgress in userStore does the same scan differently)
- notes.md references `src/components/UserProvider.tsx` which doesn't exist (stale reference)
- The `any` type is used for navigation props across all screens (no typed navigation)
- `headerButton` style is duplicated across Header, PackScreen, and PuzzleScreen
- WinBanner uses `TouchableOpacity` while everything else uses `Pressable` (inconsistency)
- Toolbar `buttonHintActive` style duplicates `button` style with only `backgroundColor` changed (could be a single style with conditional bg)

---

## Summary for Planning

The codebase is small, well-organized, and ready for the daily/weekly/monthly feature. The key work is:
1. Define placeholder challenge puzzle packs (user is doing this manually)
2. Create a challenge data model (type + storage)
3. Add streak tracking to storage
4. Build challenge preview cards on HomeScreen
5. Wire up challenge puzzle navigation (direct to PuzzleScreen with challenge puzzle data)
6. Modify WinBanner to show streak info for challenge puzzles
7. Clean up identified inconsistencies while we're in here
