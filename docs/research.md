# Toolbar System & React Navigation Bottom Tabs Research

## Part 1: Current Toolbar System

### Architecture Overview

The current toolbar is a **custom floating overlay** — not a navigation tab bar. It's a `View` with `position: 'absolute'` pinned 48px from the bottom of the PuzzleScreen. It renders 6 `Pressable` buttons in a horizontal row and connects directly to the Zustand puzzle store for state and actions.

It only exists on the Puzzle screen. Home and Pack screens have no toolbar.

### Component: `src/components/Toolbar.tsx`

**Props:**

- `isZoomed: boolean` — from `useZoom()` hook in PuzzleScreen
- `onZoomReset: () => void` — resets pinch/pan transforms

**Zustand subscriptions (9 selectors):**

- `undo`, `redo`, `clearBoard`, `cycleTapMode` — action dispatchers
- `tapMode` — current mode for icon display
- `completed` — disables all actions on win
- `moveLog.length > 0` → `canUndo`
- `redoStack.length > 0` → `canRedo`
- `cells.some(c => c !== 0)` → `hasContent`

**Buttons (left to right):**

| #   | Icon                 | Action                   | Disabled When              |
| --- | -------------------- | ------------------------ | -------------------------- |
| 1   | Minimize2            | `onZoomReset()`          | Not zoomed                 |
| 2   | Lightbulb            | Alert (placeholder)      | Never                      |
| 3   | Pencil/X/Star/Eraser | `cycleTapMode()`         | Completed                  |
| 4   | Undo2                | `undo()`                 | No moves or completed      |
| 5   | Redo2                | `redo()`                 | No redo stack or completed |
| 6   | Trash2               | Confirm → `clearBoard()` | Empty board or completed   |

The tap mode button dynamically swaps its icon based on `tapMode` using a `Record<TapMode, typeof Pencil>` lookup. The cycle order is: `cycle → mark → star → erase → cycle`.

### Styling

```
Position:   absolute, bottom 48px, full width
Layout:     row, centered, 16px gap
Buttons:    48x48px, 24px border radius (circle)
Background: theme.card (#fff light, #1E1E1E dark)
Shadow:     SHADOW_MD (offset 0,1 / opacity 0.1 / radius 4)
Icons:      20px, theme.text color
Disabled:   0.3 opacity
```

All constants from `src/utils/constants.ts`. Theme from `src/utils/useTheme.ts`.

### Store Integration (`src/store.ts`)

The toolbar doesn't hold any state — it's a pure dispatcher. All logic lives in the Zustand store:

**undo():** Pops last `Move` from `moveLog`, reverts cell values in reverse order, restores previous auto-mark sets, pushes a `RedoEntry` to `redoStack`. Triggers haptic, persists progress.

**redo():** Pops last `RedoEntry` from `redoStack`, applies forward cell values, builds an undo `Move` from current state, checks for win. Triggers haptic, persists progress.

**clearBoard():** Collects all non-empty cells as `CellChange[]`, zeros everything, clears all auto-mark sets, records the batch as a single undoable `Move`. Triggers haptic, persists progress.

**cycleTapMode():** Rotates through the `TapMode` array. Pure state update, no side effects.

### Screen Integration (`src/screens/PuzzleScreen.tsx`)

The PuzzleScreen component hierarchy:

```
View (flex: 1, bg: theme.bg)
├── GestureDetector (pinch + race(draw, pan))
│   └── View (boardArea, flex: 1, centered)
│       └── BoardView
├── Toolbar (absolute bottom overlay)
├── WinBanner (absolute bottom, slides up on win)
└── SettingsModal
```

The toolbar sits in the same View as the board but doesn't participate in flex layout. It floats on top via absolute positioning.

### Navigation System (`src/navigation.tsx`)

Currently a flat `NativeStackNavigator` with 3 screens:

```typescript
type RootStackParams = {
  Home: undefined;
  Pack: { packId: string };
  Puzzle: { packId: string; puzzleIndex: number };
};
```

- **Home** — `headerShown: false`
- **Pack** — `headerTransparent: true`
- **Puzzle** — transparent header, no shadow, blur effect, timer + settings gear in header

No tab navigation exists. The toolbar is entirely custom and screen-specific.

### Key Design Decisions in Current System

1. **Overlay, not tab bar.** The toolbar floats over content rather than occupying dedicated layout space. This maximizes board area.
2. **Puzzle-only.** Home and Pack screens don't need a toolbar — they're navigation/selection screens.
3. **Direct store connection.** No prop drilling for actions; each button subscribes to exactly the state it needs.
4. **Memo'd.** Wrapped in `React.memo()` — only re-renders when its specific subscriptions change.
5. **No animation.** Buttons are static `Pressable` components with opacity-based disable states. No transitions, no animated show/hide.

---

## Part 2: React Navigation Bottom Tab Navigator

### Two Variants

React Navigation offers **two** bottom tab navigators:

1. **`createBottomTabNavigator`** — JavaScript-rendered tab bar. Full customization. Cross-platform including web.
2. **`createNativeBottomTabNavigator`** — Uses native platform components (`UITabBarController` on iOS, `BottomNavigationView` on Android). Experimental. No web support.

Both come from `@react-navigation/bottom-tabs`. The native variant imports from `/unstable`.

### Requirements

| Requirement  | Regular                         | Native                                   |
| ------------ | ------------------------------- | ---------------------------------------- |
| Package      | `@react-navigation/bottom-tabs` | same                                     |
| Import       | `@react-navigation/bottom-tabs` | `@react-navigation/bottom-tabs/unstable` |
| React Native | Any                             | 0.79+                                    |
| Web support  | Yes                             | No                                       |
| Status       | Stable                          | Experimental                             |

This project is on RN 0.84.0 — both variants are compatible.

### Regular Bottom Tab Navigator (JS-Based)

#### Setup

```typescript
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
const Tab = createBottomTabNavigator();

function App() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
```

#### Key Props

**Navigator-level:**

- `backBehavior` — `'firstRoute'` (default) | `'initialRoute'` | `'order'` | `'history'` | `'fullHistory'` | `'none'`
- `detachInactiveScreens` — boolean (default `true`), uses `react-native-screens` to save memory
- `tabBar` — custom tab bar render function receiving `{ state, descriptors, navigation }`

**Screen-level:**

| Prop                            | Type                                               | Notes                                             |
| ------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| `tabBarLabel`                   | string or `({ focused, color }) => ReactNode`      | Falls back to `title` or route name               |
| `tabBarShowLabel`               | boolean                                            | Toggle labels                                     |
| `tabBarLabelPosition`           | `'below-icon'` or `'beside-icon'`                  | Auto-selected by default                          |
| `tabBarLabelStyle`              | style object                                       | fontSize, fontFamily, etc.                        |
| `tabBarIcon`                    | `({ focused, color, size }) => ReactNode`          | Required for icons                                |
| `tabBarIconStyle`               | style object                                       | Icon container style                              |
| `tabBarActiveTintColor`         | string                                             | Active icon/label color                           |
| `tabBarInactiveTintColor`       | string                                             | Inactive icon/label color                         |
| `tabBarActiveBackgroundColor`   | string                                             | Active tab background                             |
| `tabBarInactiveBackgroundColor` | string                                             | Inactive tab background                           |
| `tabBarBadge`                   | string or number                                   | Badge on icon                                     |
| `tabBarBadgeStyle`              | style object                                       | Badge styling                                     |
| `tabBarStyle`                   | style object                                       | Container style (supports `position: 'absolute'`) |
| `tabBarItemStyle`               | style object                                       | Individual item style                             |
| `tabBarBackground`              | `() => ReactNode`                                  | Background element (e.g. BlurView)                |
| `tabBarPosition`                | `'bottom'` (default), `'top'`, `'left'`, `'right'` | Placement                                         |
| `tabBarVariant`                 | `'uikit'` or `'material'`                          | Only for left/right positioning                   |
| `tabBarHideOnKeyboard`          | boolean                                            | Hide when keyboard opens                          |
| `tabBarButton`                  | custom pressable wrapper                           | Replace default touchable                         |
| `tabBarAccessibilityLabel`      | string                                             | Screen reader label                               |
| `lazy`                          | boolean (default `true`)                           | Render on first access only                       |
| `freezeOnBlur`                  | boolean                                            | Prevent re-renders when inactive                  |
| `popToTopOnBlur`                | boolean                                            | Pop nested stacks when navigating away            |

#### Custom Tab Bar

The `tabBar` prop is the most powerful feature. It lets you replace the entire tab bar with a custom component:

```typescript
<Tab.Navigator tabBar={(props) => <MyCustomTabBar {...props} />}>
```

The custom component receives:

- `state` — navigation state (routes, index)
- `descriptors` — screen options for each route
- `navigation` — navigation object with `emit()` for events

Note: You cannot use `useNavigation()` inside a custom tab bar — must use the `navigation` prop passed to it.

#### Events

- **`tabPress`** — Fires on tab tap. Can be prevented with `e.preventDefault()`.
- **`tabLongPress`** — Fires on long press. Custom tab bars should emit this.

#### Animations

Built-in presets:

- `animation: 'fade'` — crossfade between screens
- `animation: 'shift'` — shift + scale
- `animation: 'none'` — instant switch (default)

Advanced configuration via `transitionSpec` (timing/spring) and `sceneStyleInterpolator`.

#### Absolute Positioning

When using `tabBarStyle: { position: 'absolute' }` (transparent floating tab bar), content will render behind the tab bar. Must manually add bottom padding using `useBottomTabBarHeight()` hook.

#### Hooks

- `useBottomTabBarHeight()` — Returns the tab bar height for layout calculations.

### Native Bottom Tab Navigator (Platform Components)

#### Setup

```typescript
import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable';
const Tab = createNativeBottomTabNavigator();
```

#### What Makes It Different

Uses the OS's native tab bar implementation:

- **iOS:** `UITabBarController` — gets system behaviors like translucency, blur, and iOS 26+ Liquid Glass for free
- **Android:** `BottomNavigationView` — Material Design tab bar with ripple effects and active indicators

Because it's native, you get:

- System-consistent appearance automatically
- Better performance (no JS-side layout calculations)
- Platform-specific features (SF Symbols, system items, blur effects)

But you lose:

- Custom tab bar component (`tabBar` prop doesn't exist)
- Web support
- Fine-grained animation control
- Some cross-platform consistency

#### Platform-Specific Props

**iOS only:**

- `tabBarSystemItem` — use built-in iOS tab items (`bookmarks`, `contacts`, `downloads`, `favorites`, `featured`, `history`, `more`, `mostRecent`, `mostViewed`, `recents`, `search`, `topRated`) with automatic localized labels
- `tabBarBlurEffect` — blur preset (iOS 18 and below only): `'none'`, `'systemDefault'`, `'extraLight'`, `'light'`, `'dark'`, `'regular'`, `'prominent'`, plus material variants
- `tabBarControllerMode` — `'auto'` | `'tabBar'` | `'tabSidebar'` (iOS 18+)
- `tabBarMinimizeBehavior` — `'auto'` | `'never'` | `'onScrollDown'` | `'onScrollUp'` (iOS 26+ only)
- `bottomAccessory` — renders content above/inline with tab bar (iOS 26+ only)

**Android only:**

- `tabBarLabelVisibilityMode` — `'auto'` | `'selected'` | `'labeled'` | `'unlabeled'`
- `tabBarInactiveTintColor` — inactive tab color
- `tabBarActiveIndicatorColor` — active indicator background
- `tabBarActiveIndicatorEnabled` — boolean (default `true`)
- `tabBarRippleColor` — Material ripple color

#### Icon Format

Native tab bar uses a different icon format:

```typescript
// Local image (both platforms)
tabBarIcon: { type: 'image', source: require('./icon.png'), tinted: true }

// SF Symbol (iOS only)
tabBarIcon: { type: 'sfSymbol', name: 'heart' }

// Resource name
tabBarIcon: { type: 'resource', name: 'sunny' }

// Function (for platform-specific or state-dependent)
tabBarIcon: ({ focused, color, size }) => (
  Platform.OS === 'ios'
    ? { type: 'sfSymbol', name: focused ? 'heart.fill' : 'heart' }
    : { type: 'resource', name: 'heart' }
)
```

#### Events

- **`tabPress`** — fires on tab tap, but **cannot be prevented** (controlled natively)
- **`transitionStart`** — transition animation begins
- **`transitionEnd`** — transition animation completes

#### iOS 26+ Liquid Glass

On iOS 26 (requires Xcode 26):

- Tab bar automatically gets Liquid Glass appearance
- Background color auto-adjusts based on content behind tab bar
- `tabBarBlurEffect` is ignored (only works iOS 18 and below)
- `search` system item transforms into a search field
- `tabBarMinimizeBehavior` controls collapse on scroll

#### Styling Limitations

`tabBarStyle` only supports:

- `backgroundColor` — but auto-overridden on iOS 26+ by Liquid Glass
- `shadowColor`

No custom backgrounds, no custom layouts, no custom pressable wrappers. The native component owns the rendering.

---

## Part 3: Compatibility Analysis for StarbattleMobile

### Current Dependencies

```
@react-navigation/native: ^7.1.28
@react-navigation/native-stack: ^7.12.0
react-native: 0.84.0
```

`@react-navigation/bottom-tabs` is **not installed**. Would need to be added.

### The Fundamental Mismatch

The current toolbar is **not a navigation tab bar**. It's a context-specific action bar for the puzzle screen:

| Concern       | Navigation Tabs         | Current Toolbar                            |
| ------------- | ----------------------- | ------------------------------------------ |
| Purpose       | Switch between screens  | Dispatch puzzle actions                    |
| Scope         | Global (all screens)    | Single screen (Puzzle only)                |
| State source  | Navigation state        | Zustand puzzle store                       |
| Actions       | `navigation.navigate()` | `undo()`, `redo()`, `clearBoard()`, etc.   |
| Disable logic | None (always tappable)  | State-dependent (canUndo, completed, etc.) |
| Dynamic icons | Fixed per tab           | Changes based on tapMode                   |
| Visibility    | Always visible          | Only on PuzzleScreen                       |

A bottom tab navigator is designed to switch between top-level screens. The current toolbar dispatches puzzle-specific actions. These are fundamentally different use cases.

### Where Bottom Tabs Could Fit

If the app adds top-level sections (e.g., Home, Daily, Profile), a bottom tab navigator would be the right pattern for switching between them. The current 3-screen stack (`Home → Pack → Puzzle`) is purely hierarchical — no need for tabs.

A possible future architecture:

```
TabNavigator
├── HomeTab (Stack: Home → Pack → Puzzle)
├── DailyTab (daily puzzle)
└── ProfileTab (stats, settings)
```

In this model:

- The tab bar handles top-level navigation
- The puzzle toolbar remains a custom overlay inside the Puzzle screen
- They coexist — tab bar at the very bottom, toolbar floating above it (or the tab bar hides when entering a puzzle)

### Regular vs Native: Which to Use

**Regular (`createBottomTabNavigator`):**

- Custom tab bar support via `tabBar` prop — essential if you want non-standard appearance
- Full control over animation, layout, and styling
- Works on web if ever needed
- Stable API

**Native (`createNativeBottomTabNavigator`):**

- Gets iOS Liquid Glass and Android Material for free
- Better performance
- Cannot customize tab bar component
- Experimental, API will change
- Android limited to 5 tabs
- `tabPress` cannot be prevented
- No web support

For StarbattleMobile: **Regular is the safer choice** if tabs are needed. The native variant's lack of custom tab bar support is limiting, and its experimental status is a risk. The regular variant gives full control over appearance to match the app's custom design language.

### Integration Considerations

1. **Tab bar + puzzle toolbar coexistence.** If using tabs, the puzzle screen would need to handle two bottom UI elements. Options: hide tab bar on puzzle screen (`tabBarStyle: { display: 'none' }` on the Puzzle screen option), or position the toolbar above the tab bar.

2. **Safe area.** Both tab bar variants respect safe areas. The current toolbar uses a fixed `bottom: 48px` which may not account for devices with home indicators. Adding a tab navigator would bring in proper safe area handling.

3. **Header stacking.** Tab navigators can render their own headers. With a stack nested inside a tab, you'd get double headers unless one is disabled. Current stack already uses transparent/custom headers.

4. **State persistence.** Tab navigators keep screens mounted across tab switches (unless `detachInactiveScreens` is true). A puzzle in progress on the Home tab's stack would stay alive when switching to Profile and back.

5. **Deep linking.** Tab + stack nesting requires careful deep link configuration. The current flat stack is simple.

### Combining Tab Bar with Stack Navigation

The standard pattern for nesting a stack inside a tab:

```typescript
const HomeStack = createNativeStackNavigator();
function HomeStackScreen() {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="Pack" component={PackScreen} />
      <HomeStack.Screen name="Puzzle" component={PuzzleScreen} />
    </HomeStack.Navigator>
  );
}

const Tab = createBottomTabNavigator();
function App() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="HomeTab" component={HomeStackScreen} />
      <Tab.Screen name="DailyTab" component={DailyScreen} />
    </Tab.Navigator>
  );
}
```

To hide the tab bar when entering a puzzle:

```typescript
<Tab.Screen
  name="HomeTab"
  component={HomeStackScreen}
  options={({ route }) => ({
    tabBarStyle: { display: getTabBarVisibility(route) },
  })}
/>
```

Or per-screen in the stack:

```typescript
<HomeStack.Screen
  name="Puzzle"
  component={PuzzleScreen}
  options={{ tabBarStyle: { display: 'none' } }}
/>
```

Note: hiding the tab bar on specific nested screens requires `getFocusedRouteNameFromRoute` to inspect the nested state.

---

## Part 4: Key Takeaways

1. **The current toolbar is not a tab bar.** It's a puzzle action bar. Bottom tabs won't replace it — they solve a different problem.

2. **Bottom tabs become relevant when the app has multiple top-level sections.** Phase 2 (daily puzzles, streaks) could justify tabs. The current hierarchical stack doesn't need them.

3. **If adding tabs, the regular (JS) variant is the right choice.** Full customization, stable API, matches the app's custom design language. The native variant is experimental and too restrictive.

4. **The native variant's main value is free platform integration.** Liquid Glass on iOS 26+, Material on Android. But you trade away all customization.

5. **Tab bar and puzzle toolbar can coexist** but require coordination — hide the tab bar during puzzle gameplay or adjust toolbar positioning to account for tab bar height.

6. **No architectural changes needed today.** The current system is clean and well-scoped. Tab navigation is a future consideration when the app grows beyond a single content flow.
