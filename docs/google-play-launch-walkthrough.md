# Google Play Launch — Walkthrough

The Android counterpart to `launch-validation-checklist.md` (App Store + Adapty).
Google Play is now **unlocked** (account approved), so this is the full path from
"approved" → "live on Play." It covers **three things you asked for**: (1) signing
+ building a real release, (2) spinning up a phone **and** tablet for screenshots,
and (3) the Adapty ↔ Google Play billing wiring that mirrors what we did for Apple.

For each step: **what to do → where → what "done" looks like.**

> **Redaction:** never commit secret values — the upload keystore passwords, the
> Google Cloud **service-account JSON**, or any Adapty secret key. The keystore
> file, `keystore.properties`, and the service-account JSON stay **out of git**
> (the `.gitignore` edits in Step 1 handle this). Public Adapty SDK key is fine.

**Reference IDs** (reuse the **same** IDs as Apple so Adapty maps cleanly):
premium one-time product `sb_premium_599` · access level `premium` ·
paywall `main_paywall` · webhook `adapty-webhook` ·
package name `com.omaratechnologydesign.starbattle` · current `versionCode 3`.

**Scope for v1:** premium only (`sb_premium_599`). No packs yet — same as Apple.

---

## Where things stand (read first)

| Thing | Status | Action |
|---|---|---|
| Play developer account | ✅ Approved | — |
| `targetSdk` 36 / `minSdk` 24 | ✅ Passes Play's 35+ rule | — |
| New Architecture + Hermes | ✅ On | — |
| **Release signing** | ❌ Signed with **debug** keystore | **Step 1 — blocker** |
| Upload keystore | ❌ Doesn't exist | Step 1 |
| App entry in Play Console | ❌ Not created | Step 2 |
| Store listing + screenshots | ❌ | Steps 2–3 |
| In-app product on Play | ❌ | Step 4 |
| Adapty → Google Play integration | ❌ "not set up for this store" | Step 4 |
| Google Sign-In SHA-1 registered | ⚠️ Must use **Play app-signing** cert | Step 5 gotcha |

---

## Step 1 — Signing & building the release (.aab)

Google Play rejects debug-signed builds. You need an **upload key**; Google holds
the real **app-signing key** (Play App Signing, mandatory for new apps). You sign
the `.aab` with your upload key, Google re-signs for distribution.

### 1a. Generate the upload keystore (you own the password)

Run from repo root. Pick a strong password when prompted and **store it in your
password manager** — lose this and you can reset the upload key via Play support,
but it's a hassle.

```bash
keytool -genkeypair -v \
  -keystore android/app/upload-keystore.jks \
  -alias starbattle-upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

`validity 10000` ≈ 27 years (Play wants a cert valid past 2033). **Done when:**
`android/app/upload-keystore.jks` exists.

### 1b. Create `android/keystore.properties` (gitignored)

```properties
storeFile=upload-keystore.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=starbattle-upload
keyPassword=YOUR_KEY_PASSWORD
```

### 1c. Keep the secrets out of git

`*.keystore` is already ignored, but the `.jks` and properties file are not. Add:

```gitignore
# Android release signing
*.jks
android/keystore.properties
```

### 1d. Wire Gradle to use it

In `android/app/build.gradle`, add **above** the `android {` block (around line 75):

```gradle
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

In the `signingConfigs { ... }` block, add a `release` config next to `debug`:

```gradle
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
```

In `buildTypes { release { ... } }`, replace `signingConfig signingConfigs.debug`
with a guarded pick (so local/CI builds without the keystore still succeed):

```gradle
        release {
            signingConfig keystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug
            minifyEnabled enableProguardInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
        }
```

**Done when:** `git status` shows the keystore and `keystore.properties` as
**untracked/ignored**, and only `build.gradle` + `.gitignore` are staged.

### 1e. Bump versionCode, then build the AAB

Every upload to Play needs a **unique, higher** `versionCode`. Bump it in
`android/app/build.gradle` (`versionCode 3` → `4`) before each release. `versionName`
("1.0.0") is the human label and can stay until a real version change.

```bash
cd android && ./gradlew clean bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

**Sanity-check the release build on a device before uploading** (catches Proguard /
release-only crashes the debug build hides):

```bash
cd android && ./gradlew installRelease   # installs the signed release APK variant
```

**Done when:** the `.aab` exists and the release build launches + a purchase-less
smoke test (open puzzle, play offline) works on a real device or emulator.

---

## Step 2 — Create the app + store listing in Play Console

Play Console → **Create app**. Name "Star Battle," app (not game — your call, but
"app" avoids the games-services nudges), free, declare it's an app, accept policies.

Then work the left-nav **Dashboard → "Set up your app"** tasks. The ones that gate
publishing:

- [ ] **App access** — if any content is behind login, provide test credentials.
  (Your sign-in is optional/anonymous-friendly → declare "all functionality
  available without restrictions" if true.)
- [ ] **Ads** — declare whether the app contains ads (you don't → "No").
- [ ] **Content rating** — fill the IARC questionnaire. A puzzle app rates
  Everyone; takes 5 min.
- [ ] **Target audience** — pick age groups. Avoid declaring "children" unless you
  mean it (triggers Families policy + extra review).
- [ ] **Data safety** — the Android analog of Apple's privacy nutrition labels.
  Declare what you collect (analytics/telemetry, auth identifiers, purchase data).
  You already have `files/privacy-policy.md` — **host it at a public URL** and paste
  that into **Store settings → Privacy policy**. Same for account deletion
  (`files/delete-account.md`) → Play wants a **data deletion URL**.
- [ ] **Government / news / financial features** — declare "No" as applicable.

**Main store listing** (Store presence → Main store listing):
- App name, short description (80 chars), full description (4000 chars).
- **App icon** 512×512 PNG (32-bit, ≤1 MB).
- **Feature graphic** 1024×500 PNG/JPEG — **required**, shown atop your listing.
- **Phone screenshots** — required (see Step 3).

**Done when:** every "Set up your app" task has a green check and the listing has
icon + feature graphic + ≥2 phone screenshots.

---

## Step 3 — Screenshots: phone + tablet emulators

Play screenshot rules:
- **Phone:** 2–8 images, PNG/JPEG, 16:9 or 9:16, each side **320–3840 px**. *Required.*
- **7" tablet** and **10" tablet:** optional, but you need them to earn the
  "Designed for tablets" badge and to look right on tablet listings. Recommended
  since you care about the Jony-Ive-grade presentation.

You already have a phone AVD (`Medium_Phone_API_36.1`). You need a **tablet** AVD.

### 3a. Create a tablet AVD

Easiest via **Android Studio → Device Manager → Create Device → Pixel Tablet**
(≈10.9", a clean 10" slot), system image API 35/36. Or CLI:

```bash
# device list + create (cmdline-tools must be installed)
"$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" list device | grep -i tablet
"$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" create avd \
  -n SB_Tablet_API36 -k "system-images;android-36;google_apis;arm64-v8a" -d "pixel_tablet"
```

(If `avdmanager`/`sdkmanager` aren't on PATH, they live under
`$ANDROID_HOME/cmdline-tools/latest/bin` — install "Android SDK Command-line Tools"
from Android Studio → SDK Manager → SDK Tools if missing. The GUI route avoids all
of this.)

### 3b. Boot a device and run the release build

```bash
"$ANDROID_HOME/emulator/emulator" -avd Medium_Phone_API_36.1 &   # phone
# ...or:
"$ANDROID_HOME/emulator/emulator" -avd SB_Tablet_API36 &         # tablet
npx react-native run-android --mode release                      # install the real build
```

Screenshot the running app rather than the debug build — you want production
copy/state, no Metro dev banner.

### 3c. Capture clean screenshots

```bash
# pull a pixel-perfect PNG straight off the device (no status-bar clutter if you
# enable demo mode first — optional)
adb exec-out screencap -p > shot-phone-1.png
```

Capture the same set on both phone and tablet AVDs: hero puzzle mid-solve, the
win/streak moment, the library, the paywall. **Done when:** ≥2 phone shots uploaded
(8 is better), plus a 7"/10" set if you want the tablet badge.

> Tip: turn on **demo mode** for a clean status bar:
> `adb shell settings put global sysui_demo_allowed 1` then
> `adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 1000`
> (and `... -e command battery -e level 100 -e plugged false`).

---

## Step 4 — Adapty ↔ Google Play billing (mirrors the Apple/Adapty setup)

This is the Android equivalent of Apple checklist items **B5–B10**. The pieces:
(A) create the product on Play, (B) connect Play to Adapty via a service account,
(C) wire Real-time Developer Notifications (the Android analog of App Store Server
Notifications), (D) set up license testers, (E) map the product in Adapty.

> **Ordering gotcha:** Play won't let you **activate** an in-app product until an
> app bundle **containing the Billing library** has been uploaded to a track. The
> Adapty Android SDK bundles Google Play Billing, so: do **Step 1 build + upload to
> the Internal testing track (Step 6) FIRST**, then create the product. Plan the
> order accordingly.

### 4a. Create the in-app product `sb_premium_599`

Play Console → **Monetize → Products → In-app products → Create product**.
- **Product ID:** `sb_premium_599` ← must match Apple + Adapty exactly. *Immutable
  once created — type it carefully.*
- Name: "Star Battle Premium." Description: "Unlock all premium features."
- **Price:** set the base ($5.99) and use **Set prices by country/region** to apply
  the same discounted regional strategy as Apple. Your `/Prices` CSVs are the source
  of truth — match Peru + Eurozone targets here too.
- Activate it (after the track upload, per the ordering gotcha).

This is a **one-time product** (lifetime), **not** a subscription — same as Apple's
non-consumable. Do not create it under Subscriptions.

### 4b. Create a Google Cloud service account + grant Play API access

Adapty needs API access to verify purchases and read entitlements.
1. **Google Cloud Console** → the project linked to your Play account → **IAM &
   Admin → Service Accounts → Create**. Skip optional role grants in GCP.
2. On the service account → **Keys → Add key → JSON** → download. **This JSON is a
   secret — never commit it.**
3. Enable **Google Play Android Developer API** and **Cloud Pub/Sub API** for the
   project (APIs & Services → Library).
4. **Play Console → Users and permissions → Invite the service-account email** and
   grant at least: **View financial data**, **Manage orders and subscriptions**,
   View app information. (Account-level or app-scoped to Star Battle.)

### 4c. Upload the JSON + connect in Adapty

Adapty → your app → **App settings → Google Play** integration:
- Set **Package name:** `com.omaratechnologydesign.starbattle`.
- Upload the **service-account JSON**.
- Adapty's Google Play status for the product flips from "not set up" → connected.

### 4d. Real-time Developer Notifications (RTDN) — the App-Store-Server-Notifications equivalent

Without this, refunds/voided purchases won't reach `adapty-webhook` → Supabase, so
`premium` could stay granted after a refund. (Apple checklist B9.)
1. In Adapty's Google Play integration, copy the **Pub/Sub topic name** Adapty
   provides (or create a Pub/Sub topic and grant Adapty's service account publish
   rights — Adapty's docs give the exact topic).
2. **Play Console → Monetize → Monetization setup → Real-time developer
   notifications** → paste the **topic name** → **Send test notification** to verify.

**Done when:** the test notification succeeds and Adapty shows RTDN connected.

### 4e. License testers (test purchases without being charged)

Play Console → **Setup → License testing** → add your tester Google accounts.
These accounts can buy `sb_premium_599` on the **internal testing track** and get
auto-refunded. Use the same account on the test device.

### 4f. Map the product in Adapty

Adapty → **Products** → your existing "Star Battle Premium" (access level
`premium`) → connect the **Google Play** store → map to `sb_premium_599`.
Then **Paywalls → `main_paywall`** → confirm the product is attached for Android too.

**Done when (Adapty Android parity with Apple B5–B10):**
- [ ] `sb_premium_599` exists + active on Play, regional prices set.
- [ ] Service-account JSON uploaded, Play integration shows connected.
- [ ] RTDN test notification passes.
- [ ] License testers added.
- [ ] Product mapped to `premium` access level; attached to `main_paywall`.
- [ ] A license-tester purchase shows up in **Adapty → Profiles** with `premium`
      activating (the Android version of optional item O1).

---

## Step 5 — Critical gotcha: Google Sign-In SHA-1

Your app uses `@react-native-google-signin/google-signin`. Google Sign-In only
works if the app's signing certificate **SHA-1** is registered on an Android OAuth
client. **With Play App Signing, production traffic is signed by Google's key, not
your upload key** — so the SHA-1 that matters is the **app-signing cert**, found in:

**Play Console → Release → Setup → App integrity → App signing** → copy **both** the
**App signing key certificate** SHA-1 **and** the **Upload key certificate** SHA-1.

Register **both** SHA-1s on an Android OAuth client in **Google Cloud Console → APIs
& Services → Credentials** (package `com.omaratechnologydesign.starbattle`). Upload
cert covers your local/internal builds; app-signing cert covers production installs.

**Symptom if you skip this:** sign-in works in your local debug build, then silently
fails (`DEVELOPER_ERROR`) for everyone who installs from Play. Easy to miss because
testing the upload-key build doesn't catch it.

---

## Step 6 — Actually creating a release (tracks → production)

Play uses staged tracks. Always promote upward; don't ship straight to production.

1. **Internal testing** (instant, up to 100 testers):
   Play Console → **Release → Testing → Internal testing → Create new release** →
   upload `app-release.aab` → add release notes → roll out.
   - First upload here also **enrolls you in Play App Signing** (accept the prompt)
     and **unlocks product activation** (Step 4a). Add your tester accounts, install
     via the opt-in link, verify a **real billing purchase** end-to-end.
2. **Closed testing** (optional) — broader testers, required if you want pre-launch
   feedback or to satisfy the 14-day testing requirement for personal accounts.
   > **If your Play account is a *personal* (individual) developer account created
   > recently, Google requires ~12 testers on a closed track for **14 days** before
   > you can apply for production access.** Org accounts are exempt. Check your
   > Dashboard for this requirement — it can add 2 weeks, so start the closed track
   > now if it applies.
3. **Production** — **Release → Production → Create new release** → promote the
   tested build → set **staged rollout %** (start at 20–50%, then 100%). Submit for
   review.

Each new release = **bump `versionCode`** (Step 1e) and rebuild the `.aab`.

**Done when:** the production release is "In review," then "Available on Google Play."

---

## Pre-submit gate (mirror of the Apple go/no-go)

- [ ] Release `.aab` is **upload-key signed** (not debug), builds clean.
- [ ] Play App Signing enrolled; **both** SHA-1s registered for Google Sign-In.
- [ ] Store listing complete: icon 512², feature graphic 1024×500, ≥2 phone shots
      (+ tablet shots if going for the badge).
- [ ] Content rating, Data safety, Target audience, Privacy policy URL all done.
- [ ] `sb_premium_599` active on Play with **regional** prices matching `/Prices`.
- [ ] Adapty Google Play integration connected; RTDN test passes; product mapped to
      `premium` and attached to `main_paywall`.
- [ ] One license-tester purchase confirmed end-to-end (Play → Adapty → Supabase
      `premium`), including a refund revoking access via RTDN.
- [ ] Offline play verified on the **release** build (Mission priority #3).

## What you get back

Capture the same kind of evidence as the Apple checklist (price-by-country table for
`sb_premium_599`, Adapty Products screen showing Google Play **connected**, RTDN test
success, App-signing SHA-1 screen) and Hobbes returns a **go / no-go** with gaps
called out per item. The two highest-risk Android-specific failures to verify first:
**(1)** debug-vs-upload signing, **(2)** the Google Sign-In app-signing SHA-1.
