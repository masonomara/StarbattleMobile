---
name: project-alpha-status
description: Current implementation status of the alpha rebuild — what phases are done, what remains, key gaps between old beta and new alpha code
metadata:
  type: project
---

# Alpha Build Status (as of 2026-05-18)

Branch: alpha/init. This is a rebuild from the beta to the full alpha architecture described in plan.md.

## What Is Done

**Infrastructure complete:**
- `src/config.ts` — Supabase URL/key, PowerSync URL, Adapty SDK key all set
- `src/supabase/client.ts` — Supabase client with MMKV auth token storage
- `src/powersync/AppSchema.ts` — Full SQLite schema (packs, puzzle_progress, streaks, user_entitlements, streak_archive)
- `src/powersync/Connector.ts` — SupabaseConnector with fatal Postgres error code handling
- `src/powersync/database.ts` — PowerSync singleton
- `App.tsx` — Sets up Adapty, settings, auth, PowerSync connect, watches user_entitlements

**New stores complete:**
- `src/stores/authStore.ts` — Anonymous-first auth (signInAnonymously, signUpWithEmail, signInWithApple, signOut)
- `src/stores/entitlementsStore.ts` — Reads from local SQLite via PowerSync
- `src/stores/settingsStore.ts` — MMKV-backed settings

**Types complete:**
- `src/types/state.ts` — Updated alpha types
- `src/types/user.ts` — UserRole, Entitlements, PackCatalogItem

**Supabase SQL migrations** — Run (confirmed by git history)

## What Is NOT Done / Needs Work

**Phase 6 — Progress via PowerSync:**
- `src/utils/progress.ts` — NOT CREATED (plan has full implementation)
- `store.ts` — Still uses `useUserStore` + `getProgress` (sync MMKV) + `persistProgress`; `loadPuzzle` is sync, needs to be async with PowerSync reads

**Phase 7 — Payments:**
- `src/utils/payments.ts` — NOT CREATED
- `src/packs/downloaded.ts` — Stub (returns null/false); real RNFS download not implemented
- Adapty webhook Edge Function — Not implemented

**Phase 8 — Navigation static typed API** — Still using old untyped navigator with `ComponentType` casts

**Phase 9 — Skia Canvas:**
- `PuzzleCanvas.tsx` — Placeholder `<View />`
- `useZoom.ts` — Still uses `Animated.Value`, not Reanimated shared values
- `useDrawGesture.ts` — Current implementation works but uses old approach (refs for transform state)

**Phase 10 — Screens:**
- `HomeScreen` — Old beta code still; uses `useUserStore` for progress/streaks; no entitlements/PowerSync data
- `LibraryScreen` — Old beta code; uses `useUserStore` for sequential unlock logic; no entitlements store
- `PuzzleScreen` — Old beta code; uses `BoardView` (placeholder), `persistProgress`, `useUserStore`
- `StreaksScreen` — Empty placeholder `<View />`
- `AccountScreen` — Empty placeholder `<View />`
- `PaywallModal` — Empty placeholder `<View />`

**Phase 11 — Streak System** — Not migrated to PowerSync

## Key Conflicts / Migration Debt

- `useTheme` reads from `useUserStore` (should read from `useSettingsStore`)
- `HeaderTimer`, `Toolbar`, `WinBanner`, `SettingsModal` all use `useUserStore` (must migrate to `useSettingsStore`)
- `src/stores/userStore.ts` — Old beta store still exists and is actively used by un-migrated components; manages settings + progress + streaks via MMKV
- `src/storage.ts` — Still has progress/streak functions (kept because `userStore.ts` needs them); plan says reduce to settings-only
- `store.ts` bottom: subscribes to `useUserStore` for autoX settings — should subscribe to `useSettingsStore`

## Pack Files

Only 5 packs bundled: intro, 1star-5x5, 1star-6x6, 1star-8x8, 2star-10x10
Missing: 6x6-hard, 8x8-hard, 10x10-hard, 14x14-normal, 14x14-hard (user will provide these)
Pack IDs in packs/index.ts don't yet match plan's IDs (plan uses '5x5-normal', '6x6-normal', etc.)

**Why:** The alpha rebuild is migrating from the old MMKV-only architecture to PowerSync + Supabase. The infrastructure layer is complete but the UI layer hasn't been wired up yet.

**How to apply:** When the user asks to continue plan.md, pick up at Phase 6 (progress.ts) and work forward sequentially, migrating old userStore references as each screen/component is updated.
