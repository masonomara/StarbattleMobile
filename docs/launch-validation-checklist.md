# Launch Validation — Evidence Checklist

Everything to capture and hand to Hobbes so we can confirm (A) regional pricing is
correct and (B) you're safe to submit to the App Store. Google Play is parked
(identity-verification lockout) — this covers **App Store Connect + Adapty only**.

For each item: **what to capture → where to find it → what "pass" looks like.**

> **Redaction:** never paste full secret values — App Store Shared Secret, the
> `.p8` key contents, or any Adapty secret/SDK key. Just show that the field is
> **populated** (blur the value). Public SDK key is fine to show.

> **Why screenshots, not sandbox:** sandbox regional storefronts are flaky and
> were never the validator. The App Store Connect **price-by-territory table** is
> the source of truth for what real users pay. These artifacts prove the config
> directly — no sandbox required.

Reference IDs: premium IAP (one-time, non-consumable) `sb_premium_599` · packs `starbattle_pack_{packId}` ·
paywall `main_paywall` · access level `premium` · webhook `adapty-webhook`.

---

## A. Regional pricing is correct

- [ ] **A1 — Premium IAP price-by-territory table**
  - Capture: the full territory price list for `sb_premium_599`, scrolled so **US,
    Peru, and one Eurozone country** are all visible.
  - Where: App Store Connect → Apps → Star Battle → **In-App Purchases** →
    `sb_premium_599` → **Pricing**.
  - Pass: Peru + Europe rows show your **discounted** prices in **local currency**;
    no row says "Not available"; US row is the expected base. *This single
    screenshot is the core proof that regional pricing works.*
  - What I have: This is not a subscription, Star battle Premium is a lifetime purchase. I have an in-app purchase called starbattle_premium. Product ID: `sb_premium_599` Reference name: `starbattle_premium`, Apple ID: `6771600432`. Availablity for all countires. I jsut downloaded teh prices from the in-app pricing table and put them in `/Prices` in root. My app stor elocation says Localizations: Englush US, Display Name: Star Battle Premium. Description: unlock all premium features. Status: Prepare for submission

- [ ] **A2 — Pack IAP price tables**
  - Capture: the territory price table for **at least one** `starbattle_pack_*`
    product (US + Peru + Europe visible), and a screenshot of the **In-App
    Purchases list** showing every pack product so we can confirm none were missed.
  - Where: App Store Connect → **In-App Purchases** → each `starbattle_pack_*` →
    Pricing.
  - Pass: discounted regional rows present, no "Not available," and every pack you
    sell appears in the list with pricing set.
  - What I have: I dont have any packs yet, i just want this launche diwht the premium pricing not the rest of the stuff yet

- [ ] **A3 — Availability / territories**
  - Capture: the product **Availability** panel for the premium IAP (and a pack).
  - Where: same product pages → Availability section.
  - Pass: the discounted regions (Peru, your Europe targets) are **included**, not
    excluded from sale.
  - What I have: Price Schedule is $0.00 everywhere. App availability is all coutnires. Again, nto a subscription

---

## B. Safe to submit (production wiring + review readiness)

### App Store Connect

- [ ] **B1 — Paid Apps Agreement = Active**
  - Capture: the agreements status screen.
  - Where: App Store Connect → **Business** (Agreements, Tax, and Banking).
  - Pass: Paid Apps Agreement shows **Active**, **no** "pending agreement" banner,
    bank account + tax forms complete. (Likely already active since $5.99 loads —
    confirm anyway; it gates everything.)
  - What I have: all complete

- [ ] **B2 — Premium IAP review-readiness**
  - Capture: the `sb_premium_599` detail page top (status + metadata section).
  - Where: In-App Purchases → `sb_premium_599`.
  - Pass: status **Ready to Submit** (not "Missing Metadata"); localized **display
    name + description** present; **review screenshot** attached. (Non-consumable —
    no subscription group applies.)
  - What I have: all complete

- [ ] **B3 — Packs review-readiness**
  - Capture: the In-App Purchases list showing each pack's status.
  - Pass: every pack is **Ready to Submit**, none flagged "Missing Metadata."
  - What I have: no packs being submitted yet

- [ ] **B4 — Build + version attaches the IAPs**
  - Capture: the app **version** page showing the uploaded build and the In-App
    Purchases selected for **this version's** first submission.
  - Where: App Store Connect → the app version (e.g. "1.0 Prepare for Submission").
  - Pass: a build is attached, and the IAPs are included with the submission
    (Apple reviews new IAPs alongside the first app version that contains them).
  - What I have: havent submitted the latest verison yet, seeign if i need to make any code changes after reviewing the full launch validation

### Adapty

- [ ] **B5 — Products mapped**
  - Capture: Adapty **Products** screen.
  - Where: Adapty → Apps & Products → Products.
  - Pass: `sb_premium_599` and **every** `starbattle_pack_*` show as mapped to the
    App Store product; **no** "unmapped"/error badges.
  - What I have: I have one: Priduct Name: Star Battle Premium, Access level ID: premium. App Store Status: Action Required This product requires your action in the store console. It may be ready for submission or the store may need you to complete a task (e.g., accept agreements)., Google Play Status: This product has not been set up for this store. You can connect it to the store now. Period: Lifetime, Price: $5.99

- [ ] **B6 — `main_paywall` has every product attached**
  - Capture: the `main_paywall` config showing its product list.
  - Where: Adapty → Paywalls → `main_paywall`.
  - Pass: premium **and all packs** are attached. *(Your sandbox log only returned
    the premium product — this is the item that confirms that's fixed.)*
  - What I have: Paywall name: Main Paywall, Products: 'Star Battle Premium' 

- [ ] **B7 — `premium` access level mapping**
  - Capture: the access-levels config.
  - Pass: `premium` access level exists and `sb_premium_599` grants it.
  - What I have: i have a premium access level ID is the Star Battle Premium product

- [ ] **B8 — App Store credentials configured (values blurred)**
  - Capture: Adapty's App Store integration screen.
  - Where: Adapty → app settings → App Store integration.
  - Pass: **In-App Purchase Key (.p8)**, **Issuer ID**, **Key ID**, and **App Store
    Shared Secret** all show as populated. (Optional: App Store Connect API key for
    product management.)
  - What I have: Here is my ios SK screen:
- SDK status
Installed and working
Bundle ID
Required
com.omaratechnologydesign.starbattle
In-app purchase API (StoreKit 2)
Upload in-app purchase keys to use Storekit 2 API. Please note that the fields will only be active when the app's Bundle ID is provided. Read how
Required
28acbee1-a8d9-4f75-acde-54855c1ba0cb
Required
5M2LWM6WJA
Required
File apple_store_private_key uploaded
No file chosen
App Store Connect shared secret
Get app-specific shared secret from App Store Connect and paste it here. Read how
[REDACTED — App Store shared secret; do not paste secrets into repo files]
App Store server notifications
Stalled
Notification received 15 days ago.
Copy and paste this link into URL for App Store server notifications field in App Store Connect. Read how
https://api.adapty.io/api/v1/sdk/apple/webhook/d4ca2f639e9e441791fd81eb30699ad4/

https://yourdomain.com/apple-raw-events

App Store promotional offers
Upload subscription key to use Apple promotional offers. Read how
T2WMB822AB
Click here or drag the file to this area to upload
No file chosen
App Store Connect API key
App Store Connect API connected.
Apple App ID
To find App ID, open your app page in App Store Connect, go to the App Information page in section General and find Apple ID in the left bottom part of the screen.


- [ ] **B9 — App Store Server Notifications → Adapty**
  - Capture: either Adapty showing server notifications "connected/enabled," **or**
    App Store Connect → App Information → **App Store Server Notifications** showing
    the **Production URL set to Adapty's endpoint (Version 2)**.
  - Pass: V2 production URL points at Adapty. *(Without this, production refunds
    and purchase confirmations never reach `adapty-webhook` → Supabase, so
    entitlements can go stale silently — a lifetime IAP has no renewals, but a
    refund must still revoke `premium`. Easy to forget, costly to miss.)*
  - What I have: App Store server notifications
  Stalled
  Notification received 15 days ago.
  Copy and paste this link into URL for App Store server notifications field in App Store Connect. Read how
  https://api.adapty.io/api/v1/sdk/apple/webhook/d4ca2f639e9e441791fd81eb30699ad4/
  
  https://yourdomain.com/apple-raw-events


- [ ] **B10 — App ships the production SDK key**
  - Capture: confirm which key `ADAPTY_SDK_KEY` resolves to in your release env
    (paste the **public** SDK key, or just confirm it's the public key from
    Adapty → app settings → API keys, **not** a secret key).
  - Pass: app initializes Adapty with the **public** production SDK key.
  - What i have: App Store Connect API key
  App Store Connect API connected.
  In-app purchase API (StoreKit 2)
  Upload in-app purchase keys to use Storekit 2 API. Please note that the fields will only be active when the app's Bundle ID is provided. Read how
  Required
  28acbee1-a8d9-4f75-acde-54855c1ba0cb
  Required
  5M2LWM6WJA
  Required
  File apple_store_private_key uploaded

---

## Optional (nice-to-have, not a submit gate)

- [ ] **O1 — End-to-end purchase event in Adapty.** After any successful purchase
  (sandbox is fine, flaky pricing aside), Adapty → Profiles → your test profile
  shows the purchase event and `premium` activating. Proves the
  `adapty-webhook` → Supabase chain end-to-end.
- [ ] **O2 — Supabase `user_entitlements` row updated** for that same test user.

---

## What you get back

Once A1–A3 and B1–B10 are in, Hobbes returns a **go / no-go** with any specific
gaps called out per item. A-items prove the discount reaches real users; B-items
prove the purchase + entitlement flow won't break in production.
