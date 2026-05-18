# Star Battle Goal

> Budget 5–10 minutes. Aim for ~1000 words. The more specific, the better.
>
> Use the six core sections below as a template for a good `goal.md`. Feel free to include more or fewer sections — some projects demand additional ones such as business rules, sample data, algorithms, or third-party integrations.
>
> Goals are open-ended. This is the most important step, but it can be written however you like. This is how it's structured to work well with the commands — not the only valid approach.

## Project Context (core)

What is this app, why does it need to exist, and what problem does it solve? What already exists? What's broken or missing from the current solution? What does the app need to do?

> _Example: A lightweight tool for restaurant managers to track daily inventory levels. Currently managed in a shared spreadsheet that breaks when multiple people edit at once. The app needs to let staff log counts per item, flag items below a threshold, and let managers see a daily summary — nothing more._

**Mason Answer:**

> Star Battle is a puzzle app, its. alibrary of Star battle Puzzles that you unlock by paying for them or by completing puzzless. Its a simple time-wasting puzzle thats funs, not meant to stimulate, just a puzzle you can pick up and put down, play offline, play online, create and account, save progress. jsut a fun simple puzzle that I love. The main value points is a large unique library of puzzles. Currentlyw e have a beta that has great gameplay and navigation but needs to be redisigned to better implement some of the core features like pulling and downlaoding puzzles from storage, downloading it to your device, offline/online syncing, payments for users, waht payments unlock, and aaccount management.

## User Roles (core)

Who uses the app? Describe each type of user, how they log in, what they can do in the app, what they cannot do, and what they are supposed to do. Include relevant account fields such as email, display name, avatar, etc.

> _Example:_
> _- **Admin** — created manually in Supabase; can create, edit, and delete all items and view all inventory logs; cannot delete other admins._
> _- **Staff** — signs up with email and password; can log inventory counts for their assigned location; cannot edit item definitions or view other locations._

**Mason Answer:**

> Free Users / No Account - can play certian puzzles, free puzzles, puzzles in each packs are unlocked sequentially for them. progress is saved to the cloud as an anonymous user. shoudl be about 8 hours of gameplay, about 300 free puzzles that range from 1-star to three star. they also have access to libraries of the following puzzles:

5x5/1★ Normal Star Battle
6x6/1★ Normal Star Battle
6x6/1★ Hard Star Battle
8x8/1★ Normal Star Battle
8x8/1★ Hard Star Battle
10x10/2★ Normal Star Battle
10x10/2★ Hard Star Battle
14x14/3★ Normal Star Battle
14x14/3★ Hard Star Battle

about 60 puzzles each of each of these types of puzzles.

then the free user also have access to a
4★ Special Daily Star Battle
5★ Special Weekly Star Battle
6★ Special Monthly Star Battle

> Free Users / Account - same as free useers, but can save progress across devices. free users can buy more packs without having a preimium account, and those packs they buy they do not need to compelte sequentially
> Premium users - unlimited packs, all new packs they automatically get, one time payment for free account, unlock all puzzles in free setup so they no longer need to solve sequentially

So to recap: users get abotu 9 free packs of 60 puzzles they can solve. thats 540 free puzzles. each pack they need to compelte sequentially. there will be more packs beyodn that that users need to pay for ($1.99 per pack). users can also buy a premium account for $5.99 that allows them to unlock all remaining puzzles in the free packs and then have unimited access to all future packs.

## User Flows (core)

Flows describe what users are supposed to do. Each flow should be a step-by-step sequence of actions leading to a concrete outcome. User flows should cover all key use cases.

Start from what brings the user to the app or screen and end at the outcome — what changed in the database or UI.

> _Example — Staff logs an inventory count:_
> _1. Staff opens the app and lands on the inventory list for their location._
> _2. Staff taps an item row to open the count entry form._
> _3. Staff enters the current quantity and optionally adds a note._
> _4. Staff taps Submit — count is saved, item row updates to show new quantity and timestamp._
> _5. If the quantity is below threshold, the item is flagged red on the list._

**Mason Answer:**

> 1. user opens up the app, the see a homescreen with the three daily/weekly/monthly special puzzles, and then below it a library of all he puzzles packs for them
> 2. they select a special puzzle (dailyweekly/monthly) and compelte it, it gets added to their streal
> 3. sometimes they dont finsih it, progress is saved locally (for offline) and synced to the cloud when online

> 1. user opens the app, they go to one of their puzzle libraries
> 2. they select a puzzle from teh puzzle library, if they compelte it they are prompted to go right to the next puzzle
> 3. if they dont complete it, progress is saved locally (for offline) and synced to the cloud when online

> 1. user tries to click a "locked pack" or a "locked puzzle" - they are prompted to create an account and buy a premiuma ccount to see all the unlocked puzzle, or they get a prompt to "buy a pack or buy a premium memebrship to access all packs and puzzles" - popup langage is specific to what theya re trying to do.
> 2. user creates ana ccount and purchases a pack or a memebrship
> 3. everythign is unlocked

> note that the free puzzle packs ae alrady downlaoded to the device, the premium puzzle packs ned to be downlaoded to the device later from teh cloud.

## Screens (core)

Screens describe what users see — a description of what each screen looks like and what it's for. List every screen with all key UI elements: what data is shown, what actions are available. Describe non-obvious form fields, toggles, or input shapes when the UI has complexity that wouldn't be obvious from the screen name.

> _Example:_
> _- **`/` — Inventory List**: Shows all items for the user's location sorted by category. Each row: item name, current quantity, threshold, last-updated timestamp, flag indicator. Tapping a row opens the count entry form. Managers see a location switcher at the top._
> _- **`/items/[id]` — Count Entry Form**: Item name and current count shown at top. Number input for new quantity. Optional text field for notes. Submit button. Cancel returns to list without saving._
>
> _Field constraints:_
> _- Quantity: integer only, 0–9999, no decimals_
> _- Notes: free text, max 280 characters, optional_
> _- Location: single-select dropdown populated from the locations table_

**Mason Answer:**

> Home screen: daily/weekly/monthly streak puzzles, library of other puzzles, maybe a button at the top for account/settings. top bar looks like Star Battle title, button to see your current streaks, and account buttonare the header, then a section to continue puzzles you are working on (if any), then the daily/weekly/monthly streaks, and then all the libraries of puzzles you can tackle. This is pretty similar to the beta just need to add the streaks buttn for a streaks popup and continue screen
> Library screen: pretty much match the beta
> Puzzle Screen: pretty much match the beta
> Win State: pretty much match the beta
> Streaks Screen: stat showing streaks and all the puzzles that you cna play. for memebers with premium profiles, they can play all past daily/weekly/monthly puzzles, for non premium mebers they can see teh libraries but they are locked

## Success State (core)

2–3 concrete, observable things you can check to confirm the app is working — not "it feels right," but "staff submitted a count and the row updated in the list and in the Supabase table editor."

> _Example:_
> _- Staff submits a count → the item row immediately shows the new quantity and timestamp, and a new row appears in the `inventory_counts` table in Supabase._
> _- An item with quantity below threshold → the row is flagged red in the list and stays flagged after a page refresh._
> _- Admin deletes an item → it disappears from the inventory list, but its historical counts are still visible in the `inventory_counts` table with the item marked archived._

**Mason Answer:**

> User can complete a puzzle, win state appears
> All puzzle tools work
> progress is saved for each user, they can sign out and sign in and see their progress
> premium users unlock all puzzles, non premium users need to win to unlock them sequentially
> when a user compeltes a daily/weelly/monthly streak, their streaks are updated

## Key Mutations (core)

Every important write to the database — create, update, or delete. For non-trivial operations that touch multiple tables or require atomicity, describe the full operation and it will become a Postgres function called via RPC. When in doubt, write it out — `/schema` will decide the right implementation.

> _Example:_
> _- Create inventory count (staff submits a quantity for an item)_
> _- Update item threshold (admin changes the low-stock alert level)_
> _- Create item (admin adds a new item to the inventory list)_
> _- Delete item (admin removes an item; cascades to all counts)_

**Mason Answer:**

> Keep track of all the streaks
> User loses a streak if they dont play the daily/weekly/monthly puzzle
> Streak updates if user compeltes daily/weekly/monthly puzzle
> When user compeltes a puzzle, compelte state is updated
> When user completes a library the states are updated
> Progress is saved on each puzzle
> Progress is saved one each pack
> Account settings are saved
> account progress is saved
> purchases tied to an account are saved
> pack unlock status is updated and tracked
> new puzzle packs can be uploaded

## Business Rules (bonus)

Invariants and edge cases the system must enforce — things that would be bugs if violated.

> _Example:_
> _- A staff member can only submit one count per item per shift_
> _- Quantity cannot be negative_
> _- Deleting an item archives it rather than hard-deletes, so historical counts are preserved_

**Mason Answer:**

> Premium users have full access to all libraries and puzzles
> non-premium users in the free packs only have access to puzzles that they unlock
> non-premium users can view but cannot access the packs
> progress is saved offline and synced online when attatched to the cloud
> premium profile has unlimted access to all new packs, it sa one time purchase
> individual puzzle packs are also one time purchases so they are always saved
> users need an account before they make a purchase

## Constraints (bonus)

Hard limits the system must respect.

> _Example:_
> _- Must work on mobile (staff use phones on the floor)_
> _- No email notifications — managers check the dashboard manually_
> _- All data scoped to a single organization; no multi-tenant support needed_

## Sample Data (bonus)

Representative rows showing what real data looks like and how it should be normalized. Useful for seeding and for validating the schema.

> _Example:_
> _- Item: `{ name: "Olive Oil (1L)", category: "Dry Goods", unit: "bottles", threshold: 5 }`_
> _- Count: `{ item_id: ..., quantity: 3, note: "found two in back storage", submitted_by: ..., submitted_at: "2024-01-15T14:32:00Z" }`_

**Mason Answer:**

> I will provide sample data, sample puzzles that work. full puzzle pack will be as follows:

5x5/1★ Normal Star Battle
6x6/1★ Normal Star Battle
6x6/1★ Hard Star Battle
8x8/1★ Normal Star Battle
8x8/1★ Hard Star Battle
10x10/2★ Normal Star Battle
10x10/2★ Hard Star Battle
14x14/3★ Normal Star Battle
14x14/3★ Hard Star Battle

60 puzzles each of each of these types of puzzles.

then the free user also have access to a
4★ Special Daily Star Battle
5★ Special Weekly Star Battle
6★ Special Monthly Star Battle

We will start with those, i need to tweak the difficulty meter so dont worry about the difficulty, just pretend they are rated proper. packs are in teh following files, i need to port them to supabase:

## Algorithm (bonus)

If the app has a non-trivial calculation — scoring, ranking, matching, pricing — describe it precisely. Claude will implement it as a Postgres function.

> _Example:_
> _- ELO rating update: K=32, expected score = 1 / (1 + 10^((opponent_rating - player_rating) / 400))_

**Mason Answer:**

All calcuation is one locally in another codebase: https://github.com/masonomara/star-battle

## Third-Party Integrations (bonus)

Any external services the app talks to — APIs, webhooks, storage, email, payments, etc.

> _Example:_
> _- Resend for transactional email (low-stock alerts to managers)_
> _- Cloudinary for item photo uploads_

**Mason Answer:**

Refer to `research.md`, looks like we will be using:

### Rendering

**react-native-skia** — single canvas, GPU-accelerated, worklet-driven. One GestureDetector on the canvas handles all touch; coordinate math in worklets computes cell from screen position. Eliminates N² CellView renders, enables per-cell animations without JS thread involvement.

### Gestures

**react-native-gesture-handler v3** — hooks API, New Arch only, worklet-based. Compose: `Simultaneous(pinch + two-finger-pan, Exclusive(long-press-draw, tap))`. Use `activateAfterLongPress` on the draw Pan gesture.

### Animation

**react-native-reanimated v4** — CSS Transitions API for per-cell state animations, shared values for gesture-driven board transforms.

### Haptics

**react-native-nitro-haptics** — worklet-compatible via Nitro boxing, New Arch only.

### Local State

**Zustand 5** for puzzle session state. Evaluate **Legend State v3** when designing cloud sync — its built-in MMKV + Supabase sync story may collapse the persistence and sync layers into one declarative solution.

### Local Storage

**react-native-mmkv v4** for settings, auth tokens, small blobs.  
**op-sqlite + Drizzle** for all structured data (puzzle progress, purchase records, entitlements).

### Navigation

**React Navigation v7** (native-stack). Adopt the static API for full TypeScript inference. Watch v8 for `React.Activity` screen pausing.

### Backend

**Supabase** — Postgres + Auth + Storage + Edge Functions. Self-hostable.

### Offline Sync

**PowerSync** on top of Supabase — genuine offline-first SQLite on client, Postgres WAL as source of truth, your own write API for conflict control.

### Authentication

**Supabase Auth** — pure JS, no Expo deps. Native Apple Sign In via `@invertase/react-native-apple-authentication` → `signInWithIdToken`. Anonymous-first, upgrade to permanent account when user opts in.

### Payments

**Adapty** — better free tier ($5K MTR), built-in paywall A/B testing, bare RN SDK. Entitlement webhooks → Supabase Edge Function → `user_entitlements` table → PowerSync streams to client.
