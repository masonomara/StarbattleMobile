# Star Battle Goal

## Project Context (core)

Star Battle is a mobile puzzle app and a curated library of Star Battle puzzles that users unlock either by completing earlier puzzles or by paying. The experience is intentionally low stimulation as a fun pick up and put down puzzle you can play offline or online with progress saved across devices when signed in.

The core value proposition is the largest unique library of Star Battle puzzles available offline with clean low friction UX.

Today there exists a working beta with solid gameplay and navigation. The beta needs to be redesigned and rebuilt to properly support pulling and downloading puzzle packs from cloud storage to the device and offline play with online sync when reconnected and anonymous play with optional account upgrade and account management for cross-device progress and one-time payments for individual packs and a premium tier for account and entitlement tracking for what each user owns and has unlocked.

We will not be including social features or multiplayer or leaderboards or ads or subscriptions as premium is one-time only.

## User Roles (core)

There are three user roles. All three can play. The differences are about persistence and library access and what they need to pay for.

An anonymous free user has no account. They play as an anonymous user so progress is saved to the cloud against an anonymous user ID. Anonymous users have access to the 9 free libraries detailed below so they have about 540 puzzles. They must complete each free pack sequentially so each puzzle is unlocked N+1 by finishing puzzle N. They have access to Daily Weekly and Monthly special puzzles. They cannot purchase packs or premium as they must create an account first.

A free user with an account has the same library access as anonymous users but progress syncs across devices. They can purchase individual paid packs for $1.99 each and purchased packs do not require sequential completion. A free user can purchase premium for $5.99 one-time to upgrade.

Premium users are created by a one-time $5.99 purchase tied to their account. Premium users unlock every puzzle in the 9 free libraries so no sequential requirement is needed. Premium users automatically get access to all current and future paid packs. Premium users have full access to the past Daily Weekly and Monthly puzzles.

## Libraries

The app comes with free libraries available to all users and have sequential unlock unless a user is premium. Each library contains 60 puzzles.

The libraries are as follows:

5×5 / 1★ Normal
6×6 / 1★ Normal
6×6 / 1★ Hard
8×8 / 1★ Normal
8×8 / 1★ Hard
10×10 / 2★ Normal
10×10 / 2★ Hard
14×14 / 3★ Normal
14×14 / 3★ Hard

Streak Puzzles are available to all users on a daily/weekly/monthly basis. Premium users can replay any past Streak puzzle non-premium users can only play the current one. The streak puzzles are as follows:

4★ Daily Star Battle
5★ Weekly Star Battle
6★ Monthly Star Battle

## User Flows

When an anonymous user plays a daily special they start by opening the app and will land on the home screen. The user will see the Daily and Weekly and Monthly specials at the top of the screen. When they tap the daily puzzle they are able to play it. When they complete the daily puzzle the streak updates and the win-state appears. If a user was to exit the puzzle mid-game their progress is saved locally and synced to the cloud when online.

When a user plays from a free library they begin by opening the app and scroll past the specials to the library section. The user will select a library such as 8x8 1-star normal. They will select the next unlocked puzzle in the selected pack. When the user completes the puzzle and the win state prompts them to continue to the next puzzle in the pack. If the user exits mid-game the progress is saved locally and synced when online.

A non-premium user will hit paywalls when they tap a locked pack or locked puzzle inside a free pack. When they hit a paywall a context-aware popup will appear such as a locked free puzzle that is not yet unlocked sequentially will have a message to buy a premium account to unlock this puzzle and all future puzzles for free and a locked paid pack will have a message that says to buy the pack for $1.99 or buy Premium for unlimited access. If a user has no account when they continue to pay they will have to create an account first. Immediately after account creation and purchase their entitlement updates and packs and puzzles unlock immediately.

Nine free packs are bundled with the app and already on the device after install. Paid packs are downloaded from Supabase storage after purchase. Once downloaded all packs are playable offline.

## Screens

The homescreen has a header with the star battle title and a streaks button that opens the streaks popup and an account button. Below the header is a section for continuing to play if a user has in-progress puzzles. Below the conditional section for continuing to play is the Daily/Weekly/Monthly streaks section with three cards. Below the streaks section is the library section which is a scrollable list of 9 free libraries plus any additional packs that can be purchased or just viewed. The locked paid packs are visible but show a lock icon and price.

The library screen is a grid of puzzles in the pack with completion status per puzzle. Locked puzzles which are sequential for non-premium users are shown but not yet playable. The app's current beta design is close to what is needed.

The puzzle screen shows the active puzzle with all gameplay tools including tap and drag and undo and etcetera. This screen can match or be similar to the beta's existing design.

The streaks screen shows all current streak counts and has a list of all past daily weekly streak puzzles in their own packs. Premium users can go to the past daily weekly and monthly packs and play any past puzzle and non-premium users cannot access the old pack libraries.

The account and settings screen has sign in and sign out and sign up capabilities and current entitlements such as premium status and owned packs and if needed the option to purchase premium or restore purchases.

## Success States

The app is successful if a user can complete a puzzle and see the win-state screen and all puzzle gameplay tools work such as tap and drag and undo and mark and etcetera and a user can sign out and sign back in from a different device with all their progress saved. A successful app is when all premium users have every puzzle in the nine free libraries unlocked and a non-premium user sees puzzles unlocked sequentially. Completing a daily/weekly/monthly streak puzzle will increment the corresponding streak and missing one breaks it. In a successful app a user can purchase a pack or premium and the entitlement is reflected immediately in the UI and persists across sessions.

## Key Mutations

Puzzle progress needs to be saved. Partial state needs to be written locally and synced to the cloud.

Puzzle completion state and timestamp and time-to-solve recorded needs to be tracked in puzzle completed.

The pack progress needs to be updated when a puzzle is completed and the pack's progress counter and next unlocked puzzle pointer update.

The daily weekly and monthly streak increments must update on completion and reset on missed windows.

Accounts being created and upgraded such as an anonymous user upgrading to a permanent account and carrying all progress with them.

Recorded purchases must be tracked such as pack purchases or Premium purchases writing to entitlements.

Packs being unlocked and downloaded after purchase must have pack metadata and puzzles downloaded from Supabase Storage.

Account settings and preferences must be updated.

New puzzle packs uploaded by admins will be done by a new pack being added to Supabase. All users see it immediately and premium users can play it immediately and others see it available for purchase.

## Business Rules

Premium account purchase is a one-time purchase with no recurring subscription. Premium accounts unlock all free-library puzzles immediately and all current and future paid packs. Non-premium users must complete free pack puzzles sequentially. Non-premium users see locked paid packs but cannot play them without purchase. Individual paid packs are one-time purchases that once owned allow the user to play those puzzles in any order. A user must have an account before making any purchase. Progress saves offline and syncs to the cloud when connectivity is restored. Streaks are time-windowed so missing a Daily by the end of the day or a weekly by the end of the week or a monthly by the end of the month resets that streak to zero. Purchases are permanent and carry over with account login on a new device.

## Constraints

The app is mobile only and must work fully offline once packs are downloaded. Anonymous-first onboarding means users should be able to play immediately without signup. The app is to be built on React Native (New Arch) with the stack outlined under Third-Party integrations that are listed below. The app is single region which means no multi-tenant or per-organization scoping.

## Sample Data

The full puzzle library at launch includes:

5×5 / 1★ Normal
6×6 / 1★ Normal
6×6 / 1★ Hard
8×8 / 1★ Normal
8×8 / 1★ Hard
10×10 / 2★ Normal
10×10 / 2★ Hard
14×14 / 3★ Normal
14×14 / 3★ Hard
4★ Daily Star Battle (rolling)
5★ Weekly Star Battle (rolling)
6★ Monthly Star Battle (rolling)

I will provide the puzzle files and they need to be ported into Supabase. Difficulty ratings will be tweaked later and assume the current ratings are correct for now.

## Algorithm

Puzzle generation and validation is handled in a separate codebase at https://github.com/masonomara/star-battle. This app consumes pregenerated puzzles with no generation logic needed to live there.

## Third party Integrations

See research.md for full rationale. A summary of the stack is listed below.

Rendering is done with `react-native-skia` which is a single GPU-accelerated canvas that is worklet-driven for gesture handling and per-cell animations off the JS thread. Gestures are done with `react-native-gesture-handler` with hooks API and new arch only. Animation is done with `react-native-reanimated` version 4 for the CSS transitions API and shared values. Haptics are done with `react-native-nitro-haptics` for worklet compatibility with new Arch only. Local state is managed by Zustand 5 for puzzle session state and to evaluate Legend State v3 for the sync layer. Navigation is handled by React Navigation v7 with a native stack static API. The backend is managed by Supabase including Postgres and auth and storage and edge functions. Offline sync is managed by PowerSync on top of Supabase for offline-first SQLite and Postgres WAL as the source of truth. Auth is done via Supabase auth for anonymous-first. Apple sign in can be done via `@invertase/react-native-apple-authentication` for `signInWithIdToken`. Payments are done with Adapty for entitlement webhooks with Supabase Edge Function and `user_entitlements` table with PowerSync to client.
