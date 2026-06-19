# Maestro E2E — golden-path flows

End-to-end reliability checks for the five golden paths in `BASELINE.md`. These
prove a user *can complete* each journey on a clean build — the gap analytics
can't fill. By default the flows reach the paywall and stop; full IAP purchase is
not asserted end-to-end because Adapty validates receipts server-side, so a *local*
StoreKit transaction won't flip the `premium` entitlement (`purchase_result`
telemetry measures real completion in the field). See **Driving a purchase** below
for the `.storekit` config that drives the native purchase sheet in-sim.

## Flows
| File | Golden path | Asserts |
|---|---|---|
| `smoke.yaml` | app boots | reaches Home |
| `streak-archive.yaml` | #3 streak archive | archive opens + non-premium premium gate shown |
| `play-complete.yaml` | #4 play & complete | daily solved (via solve hook) → win banner |
| `paywall-reach.yaml` | #1/#2 paywall reach | locked puzzle → "Puzzle Locked" gate |

`helpers/dismiss-tutorial.yaml` is a subflow — a fresh (`clearState`) launch opens
the Tutorial, so each flow skips it to reach Home first.

## Prerequisites
- Maestro CLI on PATH, installed via the **official script** —
  `curl -Ls "https://get.maestro.mobile.dev" | bash` — then add `~/.maestro/bin`
  to PATH. (Do **not** `brew install maestro`: that cask is the unrelated
  runmaestro.ai GUI, not this CLI.)
- A booted iOS simulator with a **debug** build installed (debug, because the
  solve hook + tutorial-skip are present and testIDs are emitted). Telemetry does
  NOT send in debug (it console-logs as `[SB:TELEMETRY]`), which is fine — these
  test UI flows, not delivery.

## Run
```sh
# build + install + boot once
npm run ios            # installs the debug build on a booted sim

# run a single flow
maestro test .maestro/smoke.yaml

# run the whole suite
maestro test .maestro/

# watch/iterate on a flow
maestro test --continuous .maestro/streak-archive.yaml
```

## Notes / assumptions
- Flows assume the **English** locale (a few assertions match visible text:
  "Skip", "Puzzle Locked").
- `clearState: true` resets to a fresh anonymous, non-premium user with no
  progress — required for the gate/lock assertions. It forces a catalog sync from
  the network on launch, so the streak/pack cards use a 30s `extendedWaitUntil`.
- `paywall-reach.yaml` assumes the first pack card is the free intro pack (see the
  note in that file if it's paid).
- testIDs targeted: `home-root`, `streak-card-{daily|weekly|monthly}`,
  `archive-root`, `archive-premium-note`, `pack-card-{id}`, `puzzle-cell-{n}`,
  `dev-solve`, `win-banner`, `paywall-sheet`, `tutorial-skip`.

## Driving a purchase (StoreKit config)

`ios/StarbattleMobile.storekit` is a local StoreKit configuration so the paywall →
*Buy* → native sheet → transaction can be driven in the **simulator** without real
payment, App Store Connect, or a sandbox login. It defines the products the app
requests:

| Product ID | Type | Notes |
|---|---|---|
| `sb_premium_599` | non-consumable (one-time) | Premium membership — a **one-time** purchase, not a subscription. `$5.99` is a **test value**; the real price comes from App Store Connect (see `docs/regional-pricing.md`). |
| `starbattle_pack_8x8-challenge` | non-consumable | **Template only.** No packs are paid in the catalog today, so this is inert until a pack is marked `is_free=false`. Add real paid packs as `starbattle_pack_<id>`. |

**Attach it** (one-time, per machine): Xcode → *Product → Scheme → Edit Scheme → Run
→ Options → StoreKit Configuration →* `StarbattleMobile.storekit`. Then build to the
sim (`npm run ios`). Confirm the file opens cleanly in Xcode first — the `.storekit`
schema is Xcode-version-specific; Xcode silently migrates this v3 file forward, but
if it complains, recreate via *File → New → File → StoreKit Configuration File* and
re-enter the products above (the IDs/types are what must match).

**What it does and doesn't do — read this:**
- ✅ Drives the **StoreKit layer**: products resolve, the native purchase sheet
  appears, and a transaction completes in-sim. Good for exercising the paywall UI
  end-to-end in Maestro.
- ❌ Does **not** flip the `premium` entitlement. Adapty validates receipts
  **server-side**, and it can't validate a *local* StoreKit transaction — so
  `purchasePremium` will hit the entitlement-inactive (`lag`) path, not `success`.
  Asserting "premium actually unlocked" still requires a **sandbox tester**
  (`docs/regional-pricing.md` §4). Use the `.storekit` to prove the *flow reaches and
  completes the sheet*; use sandbox to prove *entitlement activation*.

So a Maestro membership flow can, with this config, tap *Buy Premium* and dismiss the
sheet without a paywall dead-end — but keep the entitlement-unlocked assertion in the
sandbox/manual lane, not CI.
