# Theme-aware app icons (iOS)

The iOS app icon changes to match the user's selected color palette. Light/dark
appearance is handled automatically by the OS — we do **not** ship separate
`-light`/`-dark` icon variants.

## How it works

- 7 Icon Composer `.icon` files live in `ios/`: the primary `AppIcon.icon` plus 6
  theme alternates (`AppIcon-gruvbox`, `AppIcon-original`, `AppIcon-primer`,
  `AppIcon-rosePine`, `AppIcon-seoul256`, `AppIcon-tokyoNight`). Each bakes in
  light/dark/tinted `fill-specializations`, so the OS swaps appearance on its own.
- `ios/StarbattleMobile/Info.plist` declares the 6 base alternates under
  `CFBundleIcons → CFBundleAlternateIcons`, with `CFBundlePrimaryIcon = AppIcon`.
- Runtime switching uses [`react-native-change-icon`](https://www.npmjs.com/package/react-native-change-icon)
  (`changeIcon` / `getIcon`), which call `UIApplication.setAlternateIconName`.
- `src/utils/appIcon.ts` maps a palette → icon name and exposes
  `applyThemeAppIcon(palette)`. It is iOS-only, fire-and-forget, never throws, and
  only calls the native setter when the icon actually needs to change.
- `src/stores/settingsStore.ts` calls `applyThemeAppIcon` whenever `palette`
  changes, and once on `initialize()` to reconcile the icon with the persisted
  palette on launch.

## Palette → icon mapping

| Palette      | Icon            |
| ------------ | --------------- |
| `original`   | primary `AppIcon` (no alternate) |
| `gruvbox`    | `AppIcon-gruvbox`   |
| `primer`     | `AppIcon-primer`    |
| `rosePine`   | `AppIcon-rosePine`  |
| `seoul256`   | `AppIcon-seoul256`  |
| `tokyoNight` | `AppIcon-tokyoNight`|

`original` maps to the **primary** icon because `AppIcon.icon` already _is_ the
original theme's artwork — declaring `AppIcon-original` as an active alternate
would duplicate it. (`AppIcon-original.icon` and its Info.plist entry are kept so
the set of declared alternates matches the shipped `.icon` files, but the mapping
never selects it.)

## Manual steps required (cannot be done/verified in this environment)

1. **Install pods** — the new dependency is autolinked but the pod is not yet
   installed:
   ```sh
   cd ios && pod install
   ```
2. **Rebuild the app** (clean build recommended after Info.plist + icon changes):
   ```sh
   npm run ios
   ```
3. **Device/simulator test** — verify on a real device or simulator that:
   - Selecting each palette in Settings → Color Theme swaps the home-screen icon.
   - Selecting `original` resets to the primary icon.
   - Light/dark appearance follows the system automatically.
   - The icon reflects the saved palette on a fresh launch.

## Known behavior

- **System alert:** iOS shows a "You have changed the icon for …" alert every time
  `setAlternateIconName` runs. This is enforced by the public iOS API and cannot be
  suppressed via the public API (private `_setAlternateIconName:...` SPI would risk
  App Store rejection, so it is intentionally not used). `applyThemeAppIcon` only
  fires the setter when the icon truly changes, so the alert appears at most once
  per actual palette switch — never on redundant calls or on launch when already
  in sync.
- **iOS only:** Android has no equivalent alternate-icon API here; the util no-ops
  on non-iOS platforms.
