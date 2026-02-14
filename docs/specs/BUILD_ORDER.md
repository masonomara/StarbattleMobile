# Star Battle Mobile: Zero-to-One Gameplan

**Where you are:** The solver engine works. 38 rules, 999/1000 solve rate. Everything else -- the app, the backend, the store listing -- is unbuilt. This doc is the linear path from solver to shipped app.

**Core principle:** Ship a playable local game first. Add retention, then money, then cloud -- each phase only if the previous one proves out.

---

## Three decisions (resolved)

1. **Krazydad content — decided.** Every shipped puzzle is independently generated. Strip `KD_TNT_` from production IDs. Logic techniques aren't copyrightable; specific layouts are. The solver was built against Krazydad's Two Not Touch puzzles for reference only.

2. **COPPA — decided.** No ads, no data collection from minors. Declare 13+ in store listing. No ad SDKs means no mixed-audience configuration needed.

3. **Hints — decided: free.** Unlimited, free, no server dependency. Pre-computed hint metadata bundled in puzzle files. No hint tracking, no hint monetization, no hint-related server logic.

---

## Phase 0: Content Pipeline

No app code yet. Build the thing that feeds the app. All types for puzzle output, hint metadata, pack files, and app state are defined in `GEN-types.md`.

1. **Write the pack generation script.** Take the 1000-puzzle corpus, curate it into packs with difficulty curves, output bundled JSON matching the `PackFile` / `BundledPuzzle` types in `GEN-types.md`. Each puzzle includes pre-computed hint metadata (rule name, affected cells) so the solver never runs on-device.

2. **Pre-generate daily puzzles.** Generate and solver-validate a year's worth. Every daily must be confirmed solvable -- the solver fails 1/1000, and a broken daily with strict streaks will lose users.

3. **Fix the repo.** `package.json` and `tsconfig.json` are gitignored. A clean clone can't build. Fix that. Also: level numbering comments in `src/sieve/rules/index.ts` say 1-10, actual values go to 11. Difficulty formula produces values well beyond the SBN spec's claimed 1-10 range. Clean these up.

---

## Phase 1: Playable Game

Local-only. No server, no auth, no sync, no purchases, no ads.

**What you're building:** Someone downloads the app, plays Star Battle puzzles, and it feels good.

4. **React Native scaffold.** Expo or bare -- pick one and commit.

5. **Board renderer.** Grid, regions, stars, marks. This is the core visual and will take the most iteration. Get it right.

6. **Tap-to-cycle input with haptics.** Tap a cell: empty -> star -> X -> empty. Haptic feedback on each state change.

7. **Bundle puzzle packs as JSON assets.** Ship them in the binary (~9KB per pack, ~54KB total for 6 free packs). No server fetch, no R2, no cache invalidation. Works offline on first launch.

8. **Puzzle selection screen.** Browse packs, see which puzzles are complete.

9. **Win detection + celebration.** Validate the board matches the solution. Visual/haptic feedback.

10. **Undo button.**

11. **Auto-X toggle.** When placing a star, automatically X out conflicting cells.

12. **Light/dark theme.** Follow system default.

13. **Timer.** Display elapsed time, persist across sessions.

14. **Local storage with MMKV.** Save puzzle progress. Handle write errors gracefully -- crash during write or storage pressure shouldn't corrupt state.

**Phase 1 is done when:** You can hand your phone to someone and they can play through a puzzle pack start to finish with no issues.

---

## Phase 2: Retention

Still local-only. The goal is daily habit formation.

16. **Daily puzzle.** Serve from the pre-generated set (Phase 0, step 2).

17. **Daily streak tracking.** Local, UTC-based.

18. **Hint button.** Free, unlimited. Reads pre-computed hints from puzzle metadata. No solver on device.

19. **Pack progression tracking.** Local. Track completion percentage per pack.

20. **Error highlighting toggle.** Optional: show when placed stars violate constraints.

21. **Privacy policy.** Apple and Google both reject apps without one. Write it before anything else in this phase. Cover: what data is stored locally, that nothing is collected server-side yet, and future plans for cloud sync if applicable.

**Phase 2 is done when:** Users open the app daily, play the daily puzzle, and maintain streaks.

---

## Phase 3: Monetization

Requires terms of service before any IAP goes live.

22. **Terms of service.** Cover: limitation of liability, dispute resolution, content ownership, refund policy (defer to app stores).

23. **Unlock-all-puzzles IAP.** One-time purchase. Bypasses sequential unlock within free packs. This is the only v1 IAP.

24. **RevenueCat integration.** Client-side receipt validation for unlock-all entitlement. Single entitlement, single product.

25. **App Store submission.** Polish, test on physical devices, submit for review.

**Phase 3 is done when:** The app is live in stores with the unlock-all purchase available.

---

## Phase 4: Cloud

**Only build this if Phase 1-3 prove the app has retention and revenue.** This is where auth, sync, paid packs, and server infrastructure live.

26. **Shared types package.** Single `.ts` file implementing the types from `GEN-types.md` (`UserSettings`, `PuzzleProgress`, `SyncPayload`, etc.). Used by both the Cloudflare Worker and the app. Prevents type drift.

27. **Cloudflare Worker + D1.** Auth tables (BetterAuth) + app tables (progress, settings, purchases). Include `DELETE /account` endpoint from day one (GDPR Article 17, CCPA, app store requirements).

28. **BetterAuth integration.** Factory pattern, PBKDF2 (Workers have limited crypto), cookie sessions, Google + Apple social login, Resend for emails. Includes password reset and email verification flows.

29. **Rate limiting on auth endpoints.** Login, registration, and anonymous account creation are all abuse targets. Don't skip this.

30. **Cloud sync.** Last-write-wins with client timestamps. Known limitation: clock skew can cause overwrites. Acceptable for puzzle progress. Offline queue capped at N pending changes in MMKV -- oldest pruned when exceeded.

31. **R2 puzzle storage + server-side delivery.** For paid puzzle packs.

32. **Paid puzzle packs.**

33. **RevenueCat webhook with HMAC verification.** Specify the header, algorithm, and shared secret. A spoofed webhook grants free entitlements.

34. **Purchase recovery.** Prompt anonymous users to create an account before purchasing. If they skip it and lose their phone: RevenueCat receipt restoration recovers the unlock-all entitlement but not progress. Document this tradeoff; don't over-engineer it.

---

## Cut list

These are not happening. Don't revisit them until the app has users.

- Weekly/monthly challenges (daily is enough)
- Midnight theme (light/dark covers it)
- A/B testing infrastructure (no traffic to test)
- Color highlighter tool
- Sequential puzzle unlocking (artificially slows down your best users)
- `GEN-information-architecture.md` (duplicate of other specs, creates drift)

---

## What you got right

Keep these decisions:

- **Solver-first.** Building the hard part before touching UI was correct.
- **Pre-computed hints as metadata.** No solver on device, no server cost, works offline, instant. Avoids an entire class of problems.
- **Local-first with optional cloud.** Right model for a puzzle app where offline play is non-negotiable.
- **Cloudflare stack.** Lightweight, cheap, auto-scaling. Right choice for a puzzle app.
- **Clear scope boundaries.** "Leaderboards -- not in scope." These save months.
