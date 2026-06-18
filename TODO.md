# TODO

## V1

- [ ] do a run through on android device

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
