# TODO

### Monetization
- [ ] Make sure adapty/google play/app store connect are all working
- [ ] Add prices for Latin America and Europe
- [ ] Upload to respective app stores

## V2

### Monetization
- [ ] Add paid packs to test how they work

### UX
- [ ] Add streak notifications

### Tech debt
- [ ] `usePackPreviews.ts`: the effect's `cancelled` flag doesn't abort in-flight preview fetches, so an entitlements/catalog re-sync (e.g. after purchase) can let a stale fetch overwrite newer previews on slow connections. Fix = an `AbortController` per effect run. (documented as RISK in the file)
- [ ] `packs/`: `prefetchHintsFile` / `prefetchPackFile` / `cachePackPreview` share a near-identical "already-on-disk / in-cache" preamble. Real dedup opportunity into a shared helper, but each variant differs subtly (key shape, fallback path) — needs a reviewed refactor, not a mechanical merge.
- [ ] `packStorage.ts`: `encodeForDisk()` is a passthrough no-op today — a deliberate future encryption/compression seam (see the `DEBT:` block on the encode/decode asymmetry). Decide whether to build the layer or drop the seam before launch lock-in.
- [ ] **Type-location policy** (CLAUDE.md says all types live in `types.ts`): query-result row types and Zustand store-state types are currently defined locally next to their query/store instead. Seen in `useStreakRows.ts` (`StreakRow`), `useCompletionData.ts` (inline query rows), and the store-state types (`PuzzleState`, `SettingsState`, `AuthState`, `EntitlementsState`, etc.). Decide: allow these as an explicit local exception (they're tightly coupled to their SQL/store implementation), or centralize them en masse. One-time policy call — don't churn it directory-by-directory until decided.
- [ ] **Prettier drift**: ~22 of 72 `.ts/.tsx` files are non-conformant, so prettier isn't an enforced invariant. Decide: adopt a repo-wide `prettier --write` + CI check (one mechanical commit, stays clean), or drop prettier as the standard. Policy call, not a per-file sweep.
- [ ] **Theme design-token gaps** (two missing `Theme` tokens would fix three documented `NOTE`s): (1) add a `shadowColor` token — `CircleButton` uses `#000000` while `Toolbar`/`WinBanner` use `#25292E`, so card shadows are inconsistent; (2) add a `surfaceElevated`/`sheetBackground` token — `PaywallModal`'s sheet reuses `theme.textSecondary` (a *text* token) as its surface color, which is semantically wrong and a trap for future palette authors.
- [ ] `ErrorBoundary.tsx`: error-fallback UI uses inline styles instead of `StyleSheet.create` (self-flagged `CLEANUP` comment). Isolated and working — low priority, extract for consistency.
- [ ] **`App.test.tsx` is a vacuous smoke test**: it mounts the Tutorial route (PuzzleScreen), whose native deps aren't mocked (reanimated `useEvent`/`useHandler`, Skia `PathBuilder`, likely gesture-handler), so the render throws and the app's own `ErrorBoundary` catches it — the test "passes" while rendering the *error fallback*, not the app. Fix options: (a) add the missing native mocks (reanimated gesture surface + Skia) so it renders the real tree, or (b) scope the smoke test to a smaller, mockable subtree. Also: the perfLog stall-watchdog `setInterval` (started in App, runs for app lifetime by design) leaks in tests → "worker failed to exit gracefully" warning; needs a test-only teardown or `.unref()`.
