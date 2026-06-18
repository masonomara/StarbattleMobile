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

**The price-by-territory table is the source of truth.** Real users get prices
from it directly, based on their App Store account region — deterministically. If
the table is right, regional pricing works. This is the validation that matters.

- **Console check (do this):** App Store Connect → the product → **Pricing**. The
  per-territory table must show your discounted LATAM/Europe rows in local
  currency, with no region marked "Not available." Screenshot it — that's your
  proof. See `launch-validation-checklist.md` items A1–A3.

> ⚠️ **Do not validate regional pricing through sandbox.** Sandbox storefronts are
> unreliable and frequently stay stuck on USD regardless of the tester's region —
> this is a known sandbox bug, **not** a signal your config is wrong. Relocating an
> existing sandbox tester is especially flaky; even a fresh foreign tester often
> won't switch. Chasing a foreign price in sandbox is a dead end. TestFlight uses
> production pricing tied to the tester's **real** account region, so it shows your
> own region's price too — also not a way to see a foreign price.
>
> The only reliable live confirmation of a foreign price is a real App Store
> account in that region, or **Adapty's post-launch analytics** (real per-country
> prices and revenue). Pre-launch, trust the territory table.

Sandbox is still useful for one thing: confirming the **purchase + entitlement
flow** works end-to-end (buy succeeds → `premium` activates → webhook → Supabase).
Just don't read its *price* as meaningful.

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

## 4. Two separate validations — keep them apart

**Regional pricing is a config check, not a runtime test.** Confirm the
price-by-territory tables in App Store Connect (and Play Console) per §1–§2. That
is the whole validation — the tables deterministically drive what real users pay.
Do **not** try to read a foreign price out of sandbox (see the §1 warning).

**The purchase + entitlement flow is the runtime test.** Sandbox is fine for this
— ignore the *price* it shows and just confirm the chain works:

1. Sign in a sandbox tester, cold-launch the app.
2. Open the paywall → buy → purchase succeeds.
3. Entitlement unlocks in-app (`premium` / owned pack).
4. Adapty profile shows the event + `premium` access level.
5. Supabase `user_entitlements` row updated (webhook fired).

> ⚠️ **Cold-launch between attempts.** `payments.ts` caches paywall products for
> the process lifetime (`_productsPromise`, see the note at line 9). A warm session
> won't pick up store-side changes — fully restart the app each time.

See `launch-validation-checklist.md` for the full pre-submission evidence list.

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
