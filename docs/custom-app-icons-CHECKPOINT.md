# Custom App Icons — Investigation Checkpoint

**Status:** ⚠️ Partially working — icon *switching mechanism* works, *artwork on the home screen* does not.
**Branch:** `feature/custom-icons` (WIP commit `f962976`, builds on `36121bf`)
**Last worked:** 2026-06-06
**Safe/shippable branch (unrelated to this):** `fix/icon-files` (`3280a38`) — the App Store ITMS-90895 fix.

> Read this before touching the icon code again. It will save hours.

---

## TL;DR

We want the iOS app icon to change to match the user's selected color theme
(gruvbox, primer, rosePine, seoul256, tokyoNight; `original` → primary icon).

- The **native switching works**: tapping a theme fires `setAlternateIconName`, iOS
  shows its "You have changed the icon" alert.
- The **home-screen icon does not update** to the theme artwork. Current build shows
  the primary logo for every alternate.
- Root difficulty: the real artwork only exists as iOS 26 **liquid-glass `.icon`
  (Icon Composer)** files, and `actool` only rasterizes the icon designated as the
  *primary*. Getting properly-rasterized *alternate* icons has been the whole battle.

---

## What WORKS (keep this)

1. **In-app native module** — `ios/StarbattleMobile/AppIconModule.m`
   - Plain `RCT_EXPORT_MODULE` Obj-C class compiled into the app target. Auto-registers
     under RN 0.84 New Architecture / bridgeless (verified: `NativeModules.AppIconModule`
     is non-null and methods run on device).
   - Methods: `getIcon`, `setIcon`, `supportsAlternateIcons`. Retries on transient
     POSIX `EAGAIN` (35) from the icon-change alert subsystem.
   - **Why not `react-native-change-icon`:** it ships a codegen TurboModule spec that
     never gets registered into this app's New-Arch module-provider map
     (`RCTModuleProviders.mm`), so `NativeModules.ChangeIcon` resolves to `null`. The
     in-target legacy module sidesteps that entirely. Do **not** reintroduce that lib.
2. **JS wiring** — `src/utils/appIcon.ts` (maps palette → icon name, iOS-only,
   never throws) + `src/types.ts` (`AppIconNativeModule`, `AppIconName`).
   `src/stores/settingsStore.ts` calls `applyThemeAppIcon` on palette change and on launch.
3. **Rasterizing the liquid-glass `.icon` to PNG** — `actool` CAN do it when the icon
   is passed as `--app-icon`:
   ```sh
   xcrun actool ios/AppIcon-gruvbox.icon --compile /tmp/out --app-icon AppIcon-gruvbox \
     --platform iphoneos --minimum-deployment-target 18.0 \
     --target-device iphone --target-device ipad \
     --output-partial-info-plist /tmp/out/partial.plist
   ```
   Produces real 120px (`@2x` iPhone) + 152px (iPad) PNGs. The car it emits also holds
   1024px light **and** dark renditions (see "open problems").

---

## What does NOT work / approaches tried (don't repeat these)

| # | Approach | Result | Why it failed |
|---|----------|--------|---------------|
| 1 | Keep alternate `.icon` files in the asset catalog, declare in Info.plist | Home screen **blank** | `actool` leaves non-primary `.icon` as **vector layers** in `Assets.car`; iOS won't rasterize them for runtime alternates. |
| 2 | Loose PNGs (`AppIcon-gruvbox60x60@2x.png`) + `CFBundleIconFiles` in Info.plist | Alert preview correct, **home screen ignores them** | On iOS 26 the home-screen icon comes from the compiled **asset catalog**, not loose `CFBundleIconFiles`. (Proof: the working *primary* ships only a 120px loose file yet renders on a @3x device — it uses the catalog.) |
| 3 | PNG **appiconsets** in the catalog + `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` | Alternates **now rasterized into `Assets.car` at 120/180px (verified!)**, but runtime swap shows **no change** (stays on primary) | Unknown — most likely a name/structure conflict between our manual `Info.plist` `CFBundleAlternateIcons` and the entries Xcode auto-generates from the build setting. **This is where we stopped.** |

Dead ends for getting a high-res master out of the `.icon`:
- `qlmanage -t` on a `.icon` → hangs (no QuickLook generator).
- Private CoreUI extraction (`CUICatalog` / `CUICommonAssetStorage`) → `CUINamedMultisizeImageSet` has no `image`; the rendition-storage path **hangs**. See `/tmp/carextract*.m` if revived.
- `actool --include-all-app-icon-assets` → errors with liquid-glass icons.

---

## Key facts learned (the load-bearing ones)

- **iOS Simulator cannot complete `setAlternateIconName`.** It lacks the system UI
  bundle that presents the change alert (`LSIconAlertManager` EAGAIN /
  `CoreServicesUIUpcallEmbedded` EIO "couldn't load upcall bundle"). **Always test
  alternate icons on a physical device.**
- **iPhone 12 is @3x** → home screen needs **180px**. `actool` only emits `@2x` (120)
  loose; @3x/1024 live only inside the car.
- **Home-screen icons come from `Assets.car`, not loose files**, on iOS 26.
- `actool` only rasterizes the `--app-icon` (primary). Alternates must be listed via
  `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` to be compiled at all.
- Our app icons are RGBA but **opaque** (alpha ruled out as a cause).

---

## Current repo state (commit `f962976`)

- `ios/StarbattleMobile/AppIconModule.m` — native module (good, keep).
- `ios/StarbattleMobile/Images.xcassets/AppIcon-<theme>.appiconset/` — 5 alternate
  appiconsets, **populated with real PNGs** (light render copied into both light & dark
  slots; sizes 40/58/60/80/87/120/180/1024). Universal idiom, light/dark luminosity.
- `ios/AppIcon.icon` — primary (Icon Composer, works). Alternate `.icon` files were
  **deleted**.
- `ios/StarbattleMobile/Info.plist` — `CFBundleAlternateIcons` → `CFBundleIconName`
  per theme (asset-catalog reference).
- `project.pbxproj` build settings (Debug+Release):
  `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = "AppIcon-gruvbox AppIcon-primer AppIcon-rosePine AppIcon-seoul256 AppIcon-tokyoNight"`
  and `ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = YES`.
- Verified in built car: `AppIcon-<theme>` present at pixel sizes 60/87/120/180/1024.

---

## NEXT STEP when resuming (start here)

The artwork is correctly in the car; the bug is now purely **runtime**. In order:

1. **Re-add the on-screen diagnostic** (so we see the actual error on device): temporarily
   make `applyThemeAppIcon` / a startup self-test `Alert.alert` the result of
   `setIcon(...)` and the caught error `code`/`message`. (Old version of this is in git
   history around the diagnostic builds; ~20 lines.)
2. **Diff the BUILT `Info.plist`** (in the `.app`) `CFBundleIcons.CFBundleAlternateIcons`
   against our source one. With `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` set,
   Xcode auto-generates alternate entries at build time — suspect a duplicate/clobber/
   mismatch with our manual entries. Try **removing our manual `CFBundleAlternateIcons`**
   and letting the build setting generate them (then `setIcon('AppIcon-gruvbox')`).
3. If `setIcon` rejects with an "icon not found"-style error, the name iOS expects ≠
   `AppIcon-<theme>`. Print `supportsAlternateIcons` and try the exact generated names.

### Testing recipe (physical device — the only way)
```sh
DEVID=A31A08B6-26DC-54CA-A08E-452672BDBE94          # `xcrun devicectl list devices`
APP=~/Library/Developer/Xcode/DerivedData/StarbattleMobile-*/Build/Products/Debug-iphoneos/StarbattleMobile.app
# run-ios install is flaky ("device disconnected"); prefer devicectl + a clean uninstall
# (uninstall also clears iOS's icon cache, which otherwise masks changes):
xcrun devicectl device uninstall app --device "$DEVID" com.omaratechnologydesign.starbattle
xcrun devicectl device install   app --device "$DEVID" "$APP"
xcrun devicectl device process launch --device "$DEVID" com.omaratechnologydesign.starbattle
```
Inspect the compiled car:
```sh
xcrun --sdk iphoneos assetutil --info "$APP/Assets.car" | grep -A6 '"Name" : "AppIcon-gruvbox"'
```

---

## Still-open TODOs (after the home screen works)

- **Light/dark:** dark slots currently reuse the light render, so dark mode shows the
  light icon. Need real dark-appearance renders. The car from a single `actool` run
  contains both `UIAppearanceAny` (light) and `UIAppearanceDark` 1024px renditions —
  find a non-hanging way to extract them, or render dark via `actool` appearance flags.
- **High-res master:** the 1024px appiconset images are upscaled from a 152px render
  (fine for the device home screen at 120/180, **not** App-Store-grade at 1024). Need a
  proper ≥1024 source per theme (Icon Composer GUI export is the reliable fallback —
  it's installed: `/Applications/.../Icon Composer.app`).
- Consider whether the whole feature is worth it vs. shipping `fix/icon-files` alone.
