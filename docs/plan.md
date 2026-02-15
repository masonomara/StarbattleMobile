# Plan: Replace Custom Toolbar with Native Bottom Tab Bar

## Goal

Remove the floating `Toolbar` overlay and replace it with `createNativeBottomTabNavigator`. The native tab bar renders `UITabBarController` on iOS and `BottomNavigationView` on Android. Each tab triggers a toolbar action (undo, redo, clear, etc.) instead of navigating to a separate screen.

## Approach

Every tab renders the same `PuzzleBoardContent` component, which reads all state from Zustand. Since the content is identical regardless of which tab is active, switching tabs is visually seamless — the user sees the same board. The `tabPress` listener on each tab dispatches the corresponding store action.

## Architecture

### Before

```
NativeStackNavigator
├── Home
├── Pack
└── Puzzle
    ├── GestureDetector + BoardView
    ├── Toolbar (absolute overlay, 6 buttons)
    ├── WinBanner
    └── SettingsModal
```

### After

```
NativeStackNavigator
├── Home
├── Pack
└── PuzzleWrapper (loads puzzle, configures stack header, renders ↓)
    ├── NativeBottomTabNavigator
    │   ├── Mode tab  → PuzzleBoardContent (tabPress → cycleTapMode)
    │   ├── Hint tab  → PuzzleBoardContent (tabPress → Alert)
    │   ├── Undo tab  → PuzzleBoardContent (tabPress → undo)
    │   ├── Redo tab  → PuzzleBoardContent (tabPress → redo)
    │   └── Clear tab → PuzzleBoardContent (tabPress → clearBoard)
    ├── WinBanner (absolute overlay, above tab bar)
    └── SettingsModal (modal, covers everything)
```

## Constraints

### Android 5-tab limit

`BottomNavigationView` supports max 5 tabs. Current toolbar has 6 buttons. **Zoom reset moves to the stack header** (right side, next to the settings gear). This is natural — zoom reset is a view-level control, not a puzzle action.

### No disabled states

The native tab bar has no concept of disabled tabs. Buttons that are currently grayed out (undo with empty history, clear on empty board, all actions when completed) will still be tappable but the store functions already no-op in those cases. The visual "0.3 opacity" disabled state is lost.

Mitigation: haptic feedback only fires when the action actually does something. The user gets tactile confirmation of success vs. no-op.

### `tabPress` cannot be prevented

The native variant controls tab switching natively. Our listener fires alongside it. This is fine because all tabs render the same content — the switch is invisible.

### No custom tab bar component

Unlike `createBottomTabNavigator`, the native variant doesn't accept a `tabBar` prop. We get the platform's native tab bar with limited style overrides (`backgroundColor`, `shadowColor` only). This is the tradeoff for native appearance.

### Icons must use native formats

No `lucide-react-native` in the tab bar. Icons must be SF Symbols (iOS), Android drawables, or bundled PNGs.

## Tab Definitions

| Tab   | Action                      | SF Symbol (iOS)                                 | Label                                        |
| ----- | --------------------------- | ----------------------------------------------- | -------------------------------------------- |
| Mode  | `cycleTapMode()`            | Dynamic: `pencil` / `xmark` / `star` / `eraser` | Dynamic: "Cycle" / "Mark" / "Star" / "Erase" |
| Hint  | Alert placeholder           | `lightbulb`                                     | "Hint"                                       |
| Undo  | `undo()`                    | `arrow.uturn.backward`                          | "Undo"                                       |
| Redo  | `redo()`                    | `arrow.uturn.forward`                           | "Redo"                                       |
| Clear | `clearBoard()` with confirm | `trash`                                         | "Clear"                                      |

For Android, use `type: 'image'` with bundled PNGs (one per icon) or `type: 'resource'` referencing drawable resources.

## Dependencies

```bash
npm install @react-navigation/bottom-tabs
```

No other new deps. The native bottom tab navigator ships inside `@react-navigation/bottom-tabs` under the `/unstable` import path.

## File Changes

### Delete

- `src/components/Toolbar.tsx` — replaced entirely by the native tab bar

### New

- `src/components/PuzzleBoardContent.tsx` — extracted board/gesture/zoom logic, shared across all tabs
- `src/navigation/PuzzleTabNavigator.tsx` — tab navigator definition with listeners

### Modify

- `src/screens/PuzzleScreen.tsx` — becomes a thin wrapper: loads puzzle, configures stack header (timer + settings gear + zoom reset), renders `PuzzleTabNavigator` + `WinBanner` + `SettingsModal`
- `src/navigation.tsx` — no structural change needed (Puzzle route still points to PuzzleScreen)
- `src/utils/constants.ts` — remove `TOOLBAR_BOTTOM`, `TOOLBAR_BUTTON_SIZE`, `TOOLBAR_ICON_SIZE` (dead constants)

### Untouched

- `src/store.ts` — all actions (`undo`, `redo`, `clearBoard`, `cycleTapMode`) unchanged
- `src/types/state.ts` — no type changes
- `src/components/BoardView.tsx` — no changes
- `src/components/CellView.tsx` — no changes
- `src/components/WinBanner.tsx` — may need bottom offset adjustment (see step 7)

## Step-by-Step Implementation

### Step 1: Install bottom-tabs

```bash
npm install @react-navigation/bottom-tabs
cd ios && pod install && cd ..
```

### Step 2: Extract `PuzzleBoardContent`

Pull the board rendering, gesture setup, and zoom logic out of `PuzzleScreen` into a standalone component. This is what every tab renders.

```typescript
// src/components/PuzzleBoardContent.tsx
import React, { useCallback, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useIsFocused } from '@react-navigation/native';
import { BoardView } from './BoardView';
import { usePuzzleStore } from '../store';
import { useTheme } from '../utils/useTheme';
import { useZoom } from '../hooks/useZoom';
import { useDrawGesture } from '../hooks/useDrawGesture';

type Props = {
  gridSize: number;
};

export function PuzzleBoardContent({ gridSize }: Props) {
  const theme = useTheme();
  const puzzle = usePuzzleStore(s => s.puzzle);
  const completed = usePuzzleStore(s => s.completed);
  const tick = usePuzzleStore(s => s.tick);
  const isFocused = useIsFocused();

  const {
    pinchGesture,
    panGesture,
    scale,
    translateX,
    translateY,
    savedScale,
    savedTranslateX,
    savedTranslateY,
  } = useZoom(gridSize);

  const boardAreaRef = useRef<View>(null);
  const boardLayout = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const handleBoardAreaLayout = useCallback(() => {
    boardAreaRef.current?.measureInWindow((x, y, w, h) => {
      boardLayout.current = { x, y, width: w, height: h };
    });
  }, []);

  const { drawGesture } = useDrawGesture(
    gridSize,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    boardLayout,
  );

  const gesture = Gesture.Simultaneous(
    pinchGesture,
    Gesture.Race(drawGesture, panGesture),
  );

  // Only run timer on the focused tab instance
  React.useEffect(() => {
    if (!isFocused || completed || !puzzle) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isFocused, completed, puzzle, tick]);

  // Persist time only from the focused tab
  React.useEffect(() => {
    if (!isFocused || completed || !puzzle) return;
    const persistTime = () => {
      const state = usePuzzleStore.getState();
      if (!state.completed && state.puzzle) {
        const { useUserStore } = require('../stores/userStore');
        useUserStore.getState().saveProgress({
          puzzleId: state.puzzle.id,
          cells: state.cells,
          autoMarksNeighbors: [...state.autoMarksNeighbors],
          autoMarksRowsCols: [...state.autoMarksRowsCols],
          autoMarksRegions: [...state.autoMarksRegions],
          timeMs: state.timeMs,
          completed: false,
          updatedAt: Date.now(),
        });
      }
    };
    const id = setInterval(persistTime, 5000);
    return () => {
      clearInterval(id);
      persistTime();
    };
  }, [isFocused, completed, puzzle]);

  if (!puzzle) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <GestureDetector gesture={gesture}>
        <View
          ref={boardAreaRef}
          style={styles.boardArea}
          onLayout={handleBoardAreaLayout}
        >
          <BoardView
            puzzle={puzzle}
            scale={scale}
            translateX={translateX}
            translateY={translateY}
          />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  boardArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
```

### Step 3: Create `PuzzleTabNavigator`

```typescript
// src/navigation/PuzzleTabNavigator.tsx
import React from 'react';
import { Alert, Platform } from 'react-native';
import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable';
import { PuzzleBoardContent } from '../components/PuzzleBoardContent';
import { usePuzzleStore } from '../store';
import type { TapMode } from '../types/state';

const Tab = createNativeBottomTabNavigator();

const TAP_MODE_SF_SYMBOLS: Record<TapMode, string> = {
  cycle: 'pencil',
  mark: 'xmark',
  star: 'star',
  erase: 'eraser',
};

const TAP_MODE_LABELS: Record<TapMode, string> = {
  cycle: 'Cycle',
  mark: 'Mark',
  star: 'Star',
  erase: 'Erase',
};

type Props = {
  gridSize: number;
};

export function PuzzleTabNavigator({ gridSize }: Props) {
  // Wrapper components — all render the same content
  const Board = React.useCallback(
    () => <PuzzleBoardContent gridSize={gridSize} />,
    [gridSize],
  );

  // Mode tab needs a dedicated component to update its icon dynamically
  const ModeBoard = React.useCallback(
    () => <ModeTabScreen gridSize={gridSize} />,
    [gridSize],
  );

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        lazy: false, // Mount all tabs immediately for seamless switching
      }}
    >
      <Tab.Screen
        name="Mode"
        component={ModeBoard}
        options={{
          tabBarIcon: Platform.select({
            ios: { type: 'sfSymbol' as const, name: 'pencil' },
            default: {
              type: 'image' as const,
              source: require('../assets/icons/pencil.png'),
            },
          }),
          tabBarLabel: 'Cycle',
        }}
        listeners={() => ({
          tabPress: () => {
            usePuzzleStore.getState().cycleTapMode();
          },
        })}
      />

      <Tab.Screen
        name="Hint"
        component={Board}
        options={{
          tabBarIcon: Platform.select({
            ios: { type: 'sfSymbol' as const, name: 'lightbulb' },
            default: {
              type: 'image' as const,
              source: require('../assets/icons/lightbulb.png'),
            },
          }),
          tabBarLabel: 'Hint',
        }}
        listeners={() => ({
          tabPress: () => {
            Alert.alert(
              "Don't be a cheater.",
              'Just kidding, free hints are coming soon!',
            );
          },
        })}
      />

      <Tab.Screen
        name="Undo"
        component={Board}
        options={{
          tabBarIcon: Platform.select({
            ios: { type: 'sfSymbol' as const, name: 'arrow.uturn.backward' },
            default: {
              type: 'image' as const,
              source: require('../assets/icons/undo.png'),
            },
          }),
          tabBarLabel: 'Undo',
        }}
        listeners={() => ({
          tabPress: () => {
            usePuzzleStore.getState().undo();
          },
        })}
      />

      <Tab.Screen
        name="Redo"
        component={Board}
        options={{
          tabBarIcon: Platform.select({
            ios: { type: 'sfSymbol' as const, name: 'arrow.uturn.forward' },
            default: {
              type: 'image' as const,
              source: require('../assets/icons/redo.png'),
            },
          }),
          tabBarLabel: 'Redo',
        }}
        listeners={() => ({
          tabPress: () => {
            usePuzzleStore.getState().redo();
          },
        })}
      />

      <Tab.Screen
        name="Clear"
        component={Board}
        options={{
          tabBarIcon: Platform.select({
            ios: { type: 'sfSymbol' as const, name: 'trash' },
            default: {
              type: 'image' as const,
              source: require('../assets/icons/trash.png'),
            },
          }),
          tabBarLabel: 'Clear',
        }}
        listeners={() => ({
          tabPress: () => {
            const { cells, completed } = usePuzzleStore.getState();
            if (completed || !cells.some(c => c !== 0)) return;
            Alert.alert(
              'Clear Board',
              'Are you sure you want to clear the board?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Clear',
                  style: 'destructive',
                  onPress: () => usePuzzleStore.getState().clearBoard(),
                },
              ],
            );
          },
        })}
      />
    </Tab.Navigator>
  );
}
```

### Step 4: `ModeTabScreen` — dynamic icon updates

The Mode tab needs to update its icon when `tapMode` changes. This requires a dedicated screen component that calls `navigation.setOptions()`.

```typescript
// Inside src/navigation/PuzzleTabNavigator.tsx (or a separate file)
import { useNavigation } from '@react-navigation/native';

function ModeTabScreen({ gridSize }: { gridSize: number }) {
  const navigation = useNavigation();
  const tapMode = usePuzzleStore(s => s.tapMode);

  React.useEffect(() => {
    navigation.setOptions({
      tabBarIcon: Platform.select({
        ios: { type: 'sfSymbol' as const, name: TAP_MODE_SF_SYMBOLS[tapMode] },
        default: {
          type: 'image' as const,
          source: require(`../assets/icons/${tapMode}.png`),
        },
      }),
      tabBarLabel: TAP_MODE_LABELS[tapMode],
    });
  }, [tapMode, navigation]);

  return <PuzzleBoardContent gridSize={gridSize} />;
}
```

When the user taps the Mode tab:

1. `tabPress` listener fires → `cycleTapMode()` updates Zustand
2. Native tab bar focuses the Mode tab → ModeTabScreen re-renders
3. `useEffect` fires → `setOptions` updates the native tab bar icon/label

### Step 5: Rewrite `PuzzleScreen` as a wrapper

PuzzleScreen no longer renders the board directly. It loads the puzzle, configures the stack header, and renders the tab navigator.

```typescript
// src/screens/PuzzleScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Settings, Minimize2 } from 'lucide-react-native';
import { PuzzleTabNavigator } from '../navigation/PuzzleTabNavigator';
import { WinBanner } from '../components/WinBanner';
import { SettingsModal } from '../components/SettingsModal';
import { parsePuzzle } from '../utils/parsePuzzle';
import { getPack } from '../packs';
import { usePuzzleStore } from '../store';
import { useUserStore } from '../stores/userStore';
import type { RootStackParams } from '../navigation';
import { useTheme } from '../utils/useTheme';
import { formatTime } from '../utils/formatTime';
import { FONT_SIZE_SM } from '../utils/constants';

type Props = NativeStackScreenProps<RootStackParams, 'Puzzle'>;

export function PuzzleScreen({ route, navigation }: Props) {
  const { packId, puzzleIndex } = route.params;
  const pack = getPack(packId);
  const rawPuzzle = pack?.puzzles[puzzleIndex];
  const theme = useTheme();
  const [settingsVisible, setSettingsVisible] = useState(false);

  const loadPuzzle = usePuzzleStore(s => s.loadPuzzle);
  const puzzle = usePuzzleStore(s => s.puzzle);
  const completed = usePuzzleStore(s => s.completed);
  const timeMs = usePuzzleStore(s => s.timeMs);
  const showTimer = useUserStore(s => s.settings.showTimer);

  const gridSize = pack?.gridSize ?? 5;

  // Load puzzle into Zustand
  useEffect(() => {
    if (!rawPuzzle) return;
    const puzzleId = `${packId}:${puzzleIndex}`;
    const parsed = parsePuzzle(rawPuzzle, puzzleId);
    loadPuzzle(parsed);
  }, [rawPuzzle, packId, puzzleIndex, loadPuzzle]);

  // Header: timer
  const renderHeaderTitle = useCallback(
    () =>
      showTimer && !completed ? (
        <Text style={[styles.headerTimer, { color: theme.text }]}>
          {formatTime(timeMs)}
        </Text>
      ) : null,
    [showTimer, completed, theme.text, timeMs],
  );

  // Header: settings gear + zoom reset
  const renderHeaderRight = useCallback(
    () => (
      <View style={styles.headerRight}>
        <Pressable onPress={() => setSettingsVisible(true)} hitSlop={8}>
          <Settings size={20} color={theme.text} />
        </Pressable>
      </View>
    ),
    [theme.text],
  );

  useEffect(() => {
    navigation.setOptions({
      headerTitle: renderHeaderTitle,
      headerRight: renderHeaderRight,
    });
  }, [navigation, renderHeaderTitle, renderHeaderRight]);

  if (!puzzle) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <PuzzleTabNavigator gridSize={gridSize} />
      <WinBanner />
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTimer: {
    fontSize: FONT_SIZE_SM,
    fontVariant: ['tabular-nums'],
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
});
```

### Step 6: Android icon assets

Create PNG icons for Android at the required densities. Place in the project assets or Android resources.

Option A — bundled PNGs (simpler):

```
src/assets/icons/
├── pencil.png
├── xmark.png
├── star.png
├── eraser.png
├── lightbulb.png
├── undo.png
├── redo.png
├── trash.png
├── cycle.png
├── mark.png
└── erase.png
```

Option B — Android drawable resources (native):

```
android/app/src/main/res/drawable/
├── ic_pencil.xml
├── ic_undo.xml
├── ic_redo.xml
├── ic_trash.xml
└── ic_lightbulb.xml
```

Then reference as `{ type: 'resource', name: 'ic_pencil' }`.

Option A is simpler and cross-platform. Option B is more native but requires managing Android resources manually.

### Step 7: Adjust WinBanner positioning

WinBanner currently uses `bottom: -160` and slides up with a spring animation. With the custom toolbar gone, the banner needs to account for the native tab bar height instead.

The native tab bar is ~49pt on iOS and ~56dp on Android. WinBanner renders inside `PuzzleScreen` wrapper, overlaying the tab navigator. Its `bottom` positioning should be adjusted so it appears above the tab bar:

```typescript
// In WinBanner.tsx, adjust the resting position
// Old: bottom: -160 (positioned below the custom toolbar area)
// New: may need to account for native tab bar height
//      or render inside the tab content area where bottom: 0 is above the bar
```

The exact adjustment depends on whether WinBanner renders:

- **Inside the tab content area** (in PuzzleBoardContent): `bottom: 0` sits just above the tab bar naturally. Cleanest option.
- **Outside the tab navigator** (in PuzzleScreen wrapper): `bottom` must account for the tab bar height (~49pt iOS / ~56dp Android).

Rendering inside PuzzleBoardContent is cleaner since the tab content area already excludes the tab bar.

### Step 8: Clean up dead code

- Delete `src/components/Toolbar.tsx`
- Remove `TOOLBAR_BOTTOM`, `TOOLBAR_BUTTON_SIZE`, `TOOLBAR_ICON_SIZE` from `src/utils/constants.ts`
- Remove the `Toolbar` import and render from `PuzzleScreen`
- Remove lucide imports that were only used by Toolbar (`Undo2`, `Redo2`, `Minimize2`, `Trash2`, `Lightbulb`, `Pencil`, `X`, `Star`, `Eraser`) — only remove those not used elsewhere

## How Tab Switching Works

Since every tab renders the same `PuzzleBoardContent` reading from the same Zustand store, the user sees identical content regardless of which tab is active. Tab switching has zero visual impact.

The "active" tab indicator in the native tab bar shows whichever tab was last pressed. For Mode, this is meaningful — it indicates the current tap mode. For Undo/Redo/Clear, it's less semantic but not confusing — the user tapped undo, the undo tab lights up briefly.

The `useIsFocused()` guard ensures only one tab instance runs the timer and persistence intervals. Without this, 5 instances would all tick the timer simultaneously.

## Tab Bar Styling

The native tab bar offers limited styling:

```typescript
screenOptions={{
  tabBarStyle: {
    backgroundColor: theme.card,    // #fff light, #1E1E1E dark
    shadowColor: theme.shadow,
  },
  tabBarActiveTintColor: theme.accent,
}}
```

On iOS 26+, `backgroundColor` is overridden by Liquid Glass — the tab bar becomes translucent and adapts to content behind it. On iOS 18 and below, `tabBarBlurEffect` can add translucency.

On Android, additional styling is available:

```typescript
tabBarActiveIndicatorColor: theme.accentMuted,
tabBarRippleColor: theme.accent + '20',
```

## Tradeoffs

| Gained                                                                 | Lost                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------- |
| Native platform appearance (UITabBarController / BottomNavigationView) | Custom floating overlay aesthetic                       |
| iOS Liquid Glass on iOS 26+ for free                                   | Disabled state visuals (0.3 opacity)                    |
| Consistent with OS design language                                     | `lucide-react-native` icons in tab bar                  |
| Built-in safe area handling                                            | Precise control over button size/spacing                |
| Labels on each action                                                  | Hover/press animation customization                     |
| Badge support (future: undo count)                                     | Toolbar-specific layout (circular buttons with shadows) |

## Open Questions

1. **WinBanner positioning** — render inside `PuzzleBoardContent` (cleaner, `bottom: 0` works) or outside in the wrapper (needs tab bar height offset)?

2. **Android icons** — bundled PNGs or Android drawable resources? PNGs are simpler. Drawables are more native and support vector scaling.

3. **Tab bar visibility on completion** — should the tab bar hide when the puzzle is completed (all actions become no-ops)? The native tab bar can be hidden with `tabBarStyle: { display: 'none' }` but this isn't available on the native variant. Would need to investigate alternatives.

4. **Zoom reset placement** — header right (next to settings gear) is the current plan. Alternative: a floating button overlaying the board, or a double-tap gesture.
