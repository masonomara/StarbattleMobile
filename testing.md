# Phase 10 Manual Testing

**Branch:** puzzle/canvas  
**Date started:**  
**Device / Simulator:**  

---

## Setup

- [x] `npm install react-native-svg`
- [x] `cd ios && pod install`
- [x] Build + launch app

All works

---

## HomeScreen

- [x] Header shows "Star Battle" with Flame icon (left) and User icon (right)
- [x] Tap Flame → navigates to StreaksScreen
- [x] Tap User → navigates to AccountScreen
- [ ] Start a pack puzzle, play a few moves, go back → **Continue card** appears showing pack name, puzzle number, and time played
  - Got error: Running "StarbattleMobile" with {"rootTag":11,"initialProps":{},"fabric":true}
console.js:668 TypeError: Cannot read property 'puzzles' of undefined
    at anonymous (192.168.1.71:8081/index.bundle//&platform=ios&dev=true&lazy=true&minify=false&inlineSourceMap=false&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&app=com.omaratechnologydesign.starbattle:574159:26)
    at PuzzleScreen (192.168.1.71:8081/index.bundle//&platform=ios&dev=true&lazy=true&minify=false&inlineSourceMap=false&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&app=com.omaratechnologydesign.starbattle:574165:9)
    at react_stack_bottom_frame (192.168.1.71:8081/index.bundle//&platform=ios&dev=true&lazy=true&minify=false&inlineSourceMap=false&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&app=com.omaratechnologydesign.starbattle:17718:29)
    at renderWithHooks (192.168.1.71:8081/index.bundle//&platform=ios&dev=true&lazy=true&minify=false&inlineSourceMap=false&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&app=com.omaratechnologydesign.starbattle:12354:40)
    at updateFunctionComponent (192.168.1.71:8081/index.bundle//&platform=ios&dev=true&lazy=true&minify=false&inlineSourceMap=false&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&app=com.omaratechnologydesign.starbattle:13640:34)
    at beginWork (192.168.1.71:8081/index.bundle//&platform=ios&dev=true&lazy=true&minify=false&inlineSourceMap=false&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&app=com.omaratechnologydesign.starbattle:14098:41)
    at run (native)
    at runWithFiberInDEV (192.168.1.71:8081/index.bundle//&platform=ios&dev=true&lazy=true&minify=false&inlineSourceMap=false&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&app=com.omaratechnologydesign.starbattle:9810:73)
    at performUnitOfWork (192.168.1.71:8081/index.bundle//&platform=ios&dev=true&lazy=true&minify=false&inlineSourceMap=false&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&app=com.omaratechnologydesign.starbattle:16158:97)
    at workLoopSync (192.168.1.71:8081/index.bundle//&platform=ios&dev=true&lazy=true&minify=false&inlineSourceMap=false&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&app=com.omaratechnologydesign.starbattle:16053:57)
    at renderRootSync (192.168.1.71:8081/index.bundle//&platform=ios&dev=true&lazy=true&minify=false&inlineSourceMap=false&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&app=com.omaratechnologydesign.starbattle:16038:21)
    at performWorkOnRoot (192.168.1.71:8081/index.bundle//&platform=ios&dev=true&lazy=true&minify=false&inlineSourceMap=false&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&app=com.omaratechnologydesign.starbattle:15732:43)
    at performSyncWorkOnRoot (192.168.1.71:8081/index.bundle//&platform=ios&dev=true&lazy=true&minify=false&inlineSourceMap=false&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&app=com.omaratechnologydesign.starbattle:11415:24)
    at flushSyncWorkAcrossRoots_impl (192.168.1.71:8081/index.bundle//&platform=ios&dev=true&lazy=true&minify=false&inlineSourceMap=false&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&app=com.omaratechnologydesign.starbattle:11334:329)
    at processRootScheduleInMicrotask (192.168.1.71:8081/index.bundle//&platform=ios&dev=true&lazy=true&minify=false&inlineSourceMap=false&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&app=com.omaratechnologydesign.starbattle:11352:133)
    at anonymous (192.168.1.71:8081/index.bundle//&platform=ios&dev=true&lazy=true&minify=false&inlineSourceMap=false&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&app=com.omaratechnologydesign.starbattle:11426:184)
anonymous @ console.js:668
overrideMethod @ backend.js:17416
reactConsoleErrorHandler @ ExceptionsManager.js:184
anonymous @ setUpDeveloperTools.js:42
reportException @ ExceptionsManager.js:108
handleException @ ExceptionsManager.js:173
onUncaughtError @ ErrorHandlers.js:66
logUncaughtError @ ReactFabric-dev.js:7478
runWithFiberInDEV @ ReactFabric-dev.js:697
anonymous @ ReactFabric-dev.js:7508
callCallback @ ReactFabric-dev.js:5410
commitCallbacks @ ReactFabric-dev.js:5430
runWithFiberInDEV @ ReactFabric-dev.js:700
commitLayoutEffectOnFiber @ ReactFabric-dev.js:11121
flushLayoutEffects @ ReactFabric-dev.js:14530
commitRoot @ ReactFabric-dev.js:14446
commitRootWhenReady @ ReactFabric-dev.js:13352
performWorkOnRoot @ ReactFabric-dev.js:13299
performSyncWorkOnRoot @ ReactFabric-dev.js:3688
flushSyncWorkAcrossRoots_impl @ ReactFabric-dev.js:3538
processRootScheduleInMicrotask @ ReactFabric-dev.js:3570
anonymous @ ReactFabric-dev.js:3708
Welcome to React Native DevTools
Debugger integration: iOS Bridgeless (RCTHost)
- [ ] Tap continue card → lands on that puzzle with progress restored
- [ ] Complete a daily/weekly/monthly puzzle → streak card shows count > 0 and card dims
- [ ] Pack cards show completed/total count (e.g. `3/60`)

**Notes:**

---

## LibraryScreen

- [ ] Tap any free pack → grid of puzzle cells loads
- [ ] Puzzle #1 is playable (active style), cells after first uncompleted one are locked
- [ ] Tap a **locked** puzzle in a free pack → PaywallModal slides up
- [ ] Modal shows "Puzzle Locked" + "Unlock All with Premium · $5.99"
- [ ] Tapping X dismisses modal without purchasing

**Notes:**

---

## PaywallModal

- [ ] Locked puzzle tap while **anonymous** → sequential lock scenario ("Complete previous puzzle...")
- [ ] Locked paid pack tap while **anonymous** → "Create an account to purchase..." + "Create Account" button
- [ ] Tapping "Create Account" → closes modal, navigates to AccountScreen
- [ ] Locked paid pack tap while **signed in** → "Buy Pack · $X.XX" + "Buy Premium · $5.99 · All Packs"
- [ ] Loading spinner shows while purchase is in flight
- [ ] Error message appears on failed purchase

**Notes:**

---

## PuzzleScreen

- [ ] Open a puzzle, place a few stars, tap back immediately (do NOT wait) → re-open puzzle, progress is restored (beforeRemove save works)
- [ ] Complete a puzzle → WinBanner slides up with correct solve time
- [ ] Win banner "Next Puzzle" button loads the next puzzle
- [ ] Win banner on last puzzle shows "Back to [Pack]" instead

**Notes:**

---

## StreaksScreen

- [ ] Navigate via Flame icon on HomeScreen
- [ ] Three tiles (Daily / Weekly / Monthly) each show current streak count
- [ ] **Non-premium:** "Past Puzzles" section shows lock icon + premium teaser copy
- [ ] Teaser "Unlock with Premium · $5.99" button navigates to AccountScreen
- [ ] **Premium:** Three tabs (Daily / Weekly / Monthly) appear below "Past Puzzles"
- [ ] Switching tabs shows correct archive list for that type
- [ ] Tapping an archive entry navigates to that puzzle

**Notes:**

---

## AccountScreen — Anonymous state

- [ ] Screen shows "Sync Your Progress" heading and copy
- [ ] "Sign up with Apple" button visible
- [ ] "Sign up with Email" button visible
- [ ] "Already have an account? Sign in" link visible
- [ ] Tap "Sign up with Email" → email + password fields appear with "Create Account" button
- [ ] Tap "Cancel" → returns to initial sign-up view
- [ ] Tap sign-in link → same form but button reads "Sign In"
- [ ] Submit empty form → "Enter email and password" error appears
- [ ] Submit invalid credentials → error message appears from Supabase

**Notes:**

---

## AccountScreen — Signed-in state

- [ ] After sign in: user email displays in Account section
- [ ] "Buy Premium · $5.99" button shows (if not premium)
- [ ] After purchasing premium: "Premium" badge replaces buy button
- [ ] Owned packs list shows correctly (if any owned)
- [ ] "Restore Purchases" button doesn't crash
- [ ] "Sign Out" → anonymous state, sign-up UI reappears, user can still play

**Notes:**

---

## AccountScreen — Settings

- [ ] Settings section renders for both anonymous and signed-in states
- [ ] Toggling "Auto-X Neighbors" → auto-marks update immediately in active puzzle
- [ ] Toggling "Highlight Errors" → error highlighting updates immediately
- [ ] "Show Timer" toggle → timer shows/hides in PuzzleScreen header
- [ ] "Hide Toolbar" toggle → toolbar shows/hides in PuzzleScreen
- [ ] "Haptics" toggle → haptics fire/stop on cell tap
- [ ] Theme buttons (System / Light / Dark) → app color scheme changes immediately
- [ ] Settings persist after closing and reopening the app

**Notes:**

---

## Offline / Edge Cases

- [ ] Launch with no network → HomeScreen loads with bundled packs, no crash
- [ ] Play a puzzle offline → progress saves and restores correctly
- [ ] Navigate all screens offline → no crashes

**Notes:**

---

## Icons (prerequisite)

- [ ] Lucide icons render on HomeScreen (Flame, User)
- [ ] ChevronLeft renders on LibraryScreen, StreaksScreen, AccountScreen
- [ ] Check, Lock icons render in LibraryScreen puzzle grid
- [ ] Lock icon renders in StreaksScreen premium teaser
- [ ] X icon renders in PaywallModal

**Notes:**
