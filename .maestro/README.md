# Maestro E2E — golden-path flows

End-to-end reliability checks for the five golden paths in `BASELINE.md`. These
prove a user *can complete* each journey on a clean build — the gap analytics
can't fill. Full IAP purchase is deliberately **not** automated (Adapty +
StoreKit sandbox is flaky; the `purchase_result` telemetry already measures real
completion). The flows reach the paywall and stop.

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
- Maestro on PATH (installed via Homebrew cask: `brew install maestro`). If
  `maestro` isn't found, the binary lives under the Homebrew cask — add it to
  PATH or reinstall.
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
