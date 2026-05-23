# Smoke Tests — Sync, Storage & Gameplay

**Branch:** puzzle/canvas  
**Date started:**  
**Device / Simulator:**

---

## Setup

- [x] Build + launch app
- [x] App loads to HomeScreen without crashing

---

## 1. Auth & Session

- [x] Cold launch (no prior session) → app loads to HomeScreen, no sign-in prompt
- [x] Tap User icon → AccountScreen shows "Sync Your Progress" with Apple and Email options (confirms anonymous session was created)
- [ ] Check Supabase dashboard → `auth.users` table has a row with `is_anonymous = true` and a UUID

**Notes:**

Have two auth users, we'll make sure oen of these is me later

```text
| id                                   | is_anonymous | created_at                    |
| ------------------------------------ | ------------ | ----------------------------- |
| 2f521844-3f3c-47af-8777-5e8d866bfbe1 | true         | 2026-05-19 00:50:07.036703+00 |
| d5a7eee6-7805-4e74-aec8-403f37780963 | true         | 2026-05-18 21:57:09.501082+00 |
```

---

## 2. Gameplay Core

- [x] Tap any empty cell → cycles: empty → X mark → star → empty
- [x] With auto-X on, place a star → surrounding row/col/region cells get lighter auto-X marks
- [x] Tap the same star again → star removed and auto-marks removed
- [x] Make 3 moves, tap Undo 3× → board rewinds correctly each step
- [x] After undoing all, tap Redo → moves replay correctly
- [x] Switch toolbar to Erase mode, tap a marked cell → cell clears without cycling through star
- [x] Long-press + drag across empty cells → multiple X marks placed in a single stroke
- [x] Pinch to zoom, then pan → board zooms and pans smoothly
- [x] After zooming, tap cells → taps hit the correct cells at all zoom levels
- [x] Solve a puzzle correctly → WinBanner slides up showing solve time
- [x] Solve a streak puzzle (Daily/Weekly/Monthly) → WinBanner shows "Streak: N"

**Notes:**

When i zoom in and out sometimes a mark triggers, can we add a similar guard for the zoom side to side as the pan in and out?

---

## 3. Progress Persistence

- [ ] Play 3 puzzles partially (don't complete any), go back to Home → Continue card shows the most recently played puzzle with pack name, puzzle number, and time
- [ ] Tap Continue card → puzzle opens with cells already placed
  - **Got error:** `TypeError: Cannot read property 'puzzles' of undefined` at PuzzleScreen — needs investigation
- [ ] Check Supabase → `puzzle_progress` table has rows with correct `puzzle_id`, `cells` JSON, `time_ms`, `completed = false`
- [ ] Complete any puzzle → LibraryScreen shows a checkmark for that puzzle
- [ ] Check Supabase → that row now has `completed = true` and a `completed_at` timestamp
- [ ] Kill and relaunch the app, open the same puzzle → cells are gone briefly (SQL.js in-memory — expected alpha behavior), then reappear within a few seconds as PowerSync re-syncs
- [ ] If cells are missing for more than 10 seconds after relaunch → check `puzzle_progress` in Supabase first to distinguish upload vs. download failure

**Notes:**

---

## 4. Streak Sync

- [ ] Complete today's Daily puzzle → WinBanner shows streak count
- [ ] Check Supabase → `streaks` table has a row for `type = daily`, `current_count = 1`, `last_completed_key = today's date`
- [ ] Open StreaksScreen → Daily count matches what WinBanner showed
- [ ] Complete today's Daily again (go back in and win) → streak count does NOT increment (recordStreak is idempotent)

**Notes:**

---

## 5. Cross-Device Sync

- [ ] Create an account (AccountScreen → Sign up with Email) → AccountScreen switches to signed-in view showing email
- [ ] Play a puzzle halfway on Device A → row appears in Supabase `puzzle_progress`
- [ ] Sign in with same account on Device B, open the same puzzle → cells appear within a few seconds of app launch
- [ ] Complete the puzzle on Device B → `completed = true` in Supabase, Device A shows checkmark in LibraryScreen after next launch

**Notes:**

---

## 6. Screen Flows

- [x] Tap Flame icon → navigates to StreaksScreen
- [x] Tap User icon → navigates to AccountScreen
- [ ] Tap any free pack → LibraryScreen loads grid of puzzle cells
- [ ] Puzzle #1 is playable (active style), cells after first uncompleted one are locked
- [ ] Tap a locked puzzle → PaywallModal slides up with "Puzzle Locked" + "Unlock All with Premium · $5.99"
- [ ] Tap X on PaywallModal → dismisses without purchasing
- [ ] Win banner "Next Puzzle" button → loads next puzzle
- [ ] Win banner on last puzzle → shows "Back to [Pack]" instead of Next
- [ ] StreaksScreen: three tiles (Daily / Weekly / Monthly) show current streak counts
- [ ] StreaksScreen non-premium: "Past Puzzles" shows lock icon + teaser, "Unlock with Premium" navigates to AccountScreen
- [ ] AccountScreen anonymous: "Sign up with Email" → email + password fields appear
- [ ] AccountScreen anonymous: submit empty form → "Enter email and password" error
- [ ] AccountScreen anonymous: "Sign Out" → anonymous state, user can still play
- [ ] AccountScreen settings: toggling "Auto-X Neighbors" → auto-marks update immediately
- [ ] AccountScreen settings: Theme buttons (System / Light / Dark) → color scheme changes immediately
- [ ] Settings persist after closing and reopening the app

**Notes:**

---

## 7. Known Alpha Gaps (not bugs)

- **Progress missing briefly after relaunch** — SQL.js is in-memory, give PowerSync 5–10s to re-sync from Supabase
- **Past streak archive empty** — `streak_archive` table in Supabase needs seeded rows before StreaksScreen shows anything
- **Paid packs locked** — `packs` table needs published rows with `is_free = false` for the full paywall flow to be testable
- **Undo history cleared on reopen** — undo stack is session-local only, cells restore but undo history does not
