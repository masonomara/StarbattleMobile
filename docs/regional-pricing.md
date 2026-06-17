# Regional Pricing — Setup & Validation

How to configure location-based pricing for Star Battle's in-app purchases across
App Store Connect, Google Play, and Adapty — and how to prove it works in each.

## The one thing to understand first

**Adapty does not set prices. The stores do.** Apple and Google each decide the
price from the user's **store-account country** (not their IP, VPN, or phone
locale). Adapty reads the store-provided localized price at runtime; the app
renders `product.price.localizedString` everywhere a price appears
(`src/shared/lib/payments.ts` → `getLocalizedPrice`). So regional pricing "just
works" once each store is configured — there is no price field to set in Adapty.

Apple and Google are **separate systems**: prices set in App Store Connect do
**not** carry over to Google Play. You configure each one.

### Reference: products in this app

| Thing            | Identifier                       | Where in code |
|------------------|----------------------------------|---------------|
| Paywall          | `main_paywall`                   | `payments.ts:18` |
| Premium subscription | `sb_premium_599`             | `payments.ts:34` (`PREMIUM_PRODUCT_ID`) |
| Per-pack product | `starbattle_pack_{packId}`       | `payments.ts:61` |
| Premium access level | `premium`                    | `payments.ts:44` |
| Server webhook   | `supabase/functions/adapty-webhook` | grants/revokes entitlements |

> New in 2026: Adapty has **geo-pricing** — you can set per-country prices in the
> Adapty dashboard and push to both stores at once. This doc covers the
> set-it-in-each-store path; geo-pricing is an optional shortcut, especially for
> Google.

---

## 1. App Store Connect

### Configure

1. **My Apps → Star Battle → Subscriptions** (for `sb_premium_599`) /
   **In-App Purchases** (for each `starbattle_pack_*`).
2. Open the product → **Pricing**.
3. Set the base price, then **edit prices per territory**. Override Apple's
   FX-converted suggestions with your intended discounts for LATAM and Europe
   (Apple's auto-conversions are often awkward, e.g. odd local amounts).
4. Confirm no target territory shows **"Not available"**.
5. Save.

### Validate

- **Console check:** the product's Pricing screen shows the full per-territory
  table. Confirm LATAM/Europe rows match your intended discounted prices.
- **Real proof — sandbox purchase from a discounted region** (the only test that
  exercises your actual code path):
  1. **Users and Access → Sandbox → Testers** → create/edit a tester, set
     **Country or Region** to a discounted one (e.g. Brazil, Mexico).
  2. On device: **Settings → Developer → Sandbox Apple Account** → sign in as that
     tester. (If you changed an existing tester's region, sign out and back in.)
  3. Launch a dev build, trigger the paywall (lock a paid pack, or open premium).
  4. Confirm the price renders in the **local currency at the discounted amount**
     (e.g. BRL), not USD.
  5. Complete the purchase → confirm entitlement unlocks (premium flips / pack
     downloads).

> ⚠️ Apple price/metadata changes can take **up to 1 hour** to appear in sandbox.
> If you still see USD, wait and re-sign-in before assuming a bug.

---

## 2. Google Play

Apple's prices do **not** transfer here. If you skip this, there is no discount on
Android.

### Configure

1. **Monetize → Products → Subscriptions** → `sb_premium_599` → its **base plan**
   (for packs: **In-app products** → each `starbattle_pack_*`).
2. Open **regional pricing**. Google auto-suggests FX-converted local prices —
   **override** them to mirror your Apple LATAM/Europe discounts.
3. Confirm target countries are **available** (not excluded).
4. Save.

### Validate

- **Console check:** the base plan / product shows the per-country price table.
  Confirm LATAM/Europe amounts match intent.
- **Mapping check:** the **base plan ID** must match what Adapty has mapped (see §3).
- **Test the flow** (regional price is hard to fake on Android since price follows
  the account's payment-profile country):
  1. **Setup → License testing** → add a tester account.
  2. Install an internal-testing build signed with the release key.
  3. Trigger the paywall → confirm `getPaywallProducts` returns a price and the
     buy + entitlement path works.
  4. For the per-region **amounts**, trust the Play Console price table — the
     license-tester flow proves plumbing, not necessarily a foreign price.

---

## 3. Adapty

Adapty stores **no prices** — you're verifying mapping and sync, not amounts.

### Configure / verify

1. **Apps & Products → Products** → confirm each product is mapped:
   - `sb_premium_599` → App Store product **and** Google base plan.
   - each `starbattle_pack_*` → both stores.
   - No "unmapped" or error badges. Google products map to the **base plan**.
2. After any store-side price change, hit **refresh / sync** so Adapty's cache is
   current.
3. **Paywalls → `main_paywall`** → confirm every expected product is attached.

### Validate

- **Products screen:** all products show as synced, both stores, no errors.
- **Profiles / event log:** after a sandbox purchase, open the test profile and
  confirm the purchase event arrived and the `premium` access level activated.
  This also confirms the Supabase webhook (`adapty-webhook`) fired end-to-end.

---

## 4. End-to-end smoke test (per region)

Run this once per discounted region after all three are configured:

1. Set the **Apple sandbox tester** to the region.
2. Cold-launch the app (see caveat below).
3. Open the paywall → price shows in **local currency, discounted amount**.
4. Buy → purchase succeeds.
5. Entitlement unlocks in-app (premium / owned pack).
6. Adapty profile shows the event + access level.
7. Supabase `user_entitlements` row updated (webhook fired).

> ⚠️ **Cold-launch between tests.** `payments.ts` caches paywall products for the
> process lifetime (`_productsPromise`, see the note at line 9). A warm session
> will **not** pick up a price change — fully restart the app each time.

---

## Notes / gotchas

- **Price ≠ device locale.** A user in Brazil with a US App Store account pays the
  US price. Pricing follows the **store account region**.
- **`sb_premium_599`** has `599` baked into the ID. It's an immutable identifier
  only — the charged amount comes from store config, so a LATAM user named-product
  "599" is still charged the discounted local price. Don't let the name mislead.
- **`price_usd`** exists as a backend column but is **not** shown to users; every
  displayed price comes from Adapty's `localizedString`. Don't wire `price_usd` to
  a label — it would reintroduce a USD figure that contradicts regional pricing.
