# Star Battle Free — TestFlight Launch Implementation Plan

> Companion to `research.md` (repo root). That doc explains *what's wrong / missing*;
> this doc is *how to implement the fixes*, with copy-pasteable code. There is an
> older, unrelated `docs/plan.md` — this file is new and lives at the repo root.
>
> Ordering is by risk. **Phase 0 (backend) is the launch-critical path** — the
> client already calls these endpoints, so until they exist sign-in and account
> deletion throw at runtime. Phases 1–4 map to your four goals.
>
> External APIs below were verified against current docs (June 2026):
> react-native-bootsplash v7 CLI, Adapty webhook event fields, Supabase edge
> function auth, and Supabase password-recovery deep linking. Sources are listed
> at the bottom.

---

## Status snapshot (2026-06-03)

**Code & infra: all implementable work is done. `tsc` is at 0 errors. Nothing is
committed — all changes sit in the working tree.**

| Phase | Code/infra | What's left (you) |
|-------|-----------|-------------------|
| 0 — Backend | ✅ Done + **deployed to prod** (migrations applied, both edge functions ACTIVE, webhook secret set) | Verify Adapty webhook URL carries the secret (Phase 4) |
| 1 — Auth | ✅ Code done; config.toml pushed (anonymous, redirects, email confirm) | **Supabase dashboard:** enable Apple + Google providers; **custom SMTP** |
| 2 — Website | ✅ Privacy + Terms written, build passes | **Deploy** (push to your GitHub→Vercel); set App Store URL later |
| 3 — Splash | ✅ Done — white flash + layout shift fixed, diagnostics stripped | Nothing (rebuild bakes in the cleanup) |
| 4 — Payments | ✅ Code done (`.p8` untracked, prefetch tidy) | **App Store Connect** IAPs; **Adapty** products/paywall/webhook; **rotate `.p8`**; create 3 test packs |
| 5 — Native cfg | ✅ Done (export-compliance, Android deep link + `applicationId`, privacy manifest verified) | Build-number bumps; 1024 icon; (Android-only) release keystore + OAuth SHA |

**The one true launch-blocker left:** Supabase **custom SMTP** (built-in mailer is
rate-limited, so email confirm / password reset won't work for testers). Everything
else for a first TestFlight build is either done or a store/dashboard step below.

---

## 📋 What you need to do (by console)

**🔴 Supabase Dashboard → Auth** (the real blocker)
- **Configure custom SMTP** — without it, email confirmation & password reset silently fail for testers. *This is the #1 thing.*
- Enable **Apple** provider (add bundle id `com.omaratechnologydesign.starbattle` to Client IDs).
- Enable **Google** provider (add web + iOS client IDs to Authorized Client IDs).

**🔴 App Store Connect**
- Create IAPs: `sb_premium_599` (non-consumable) + one `starbattle_pack_<id>` per pack.
- Create a Sandbox tester.
- Bump the **build number** before each upload; confirm the 1024 marketing icon.
- Privacy labels, age rating, screenshots.

**🔴 Adapty Dashboard**
- Add the App Store products; set the `premium` access level; build the `main_paywall`.
- Point the webhook at `https://zvqdcrszalxmgtmcnevg.supabase.co/functions/v1/adapty-webhook?secret=6c546e1c0860af43b73763e8f64d228866586f4e51fd1f43`.
- Upload the App Store API `.p8`.

**🟡 Security / housekeeping**
- **Rotate** the App Store `.p8` key (it was in git history; I untracked it but history remains).
- **Deploy the website** (push the `starbattlefree-website` repo to your GitHub→Vercel). *(The app code is already committed on `testflight`.)*

**🟡 Test packs** — generate 3 with your tool (e.g. 8×8 Expert $1.99, 10×10 Challenge $2.99, 14×14 Marathon $3.99) → upload JSON+hints to the `packs` bucket → run the catalog `INSERT` (SQL in §4.4) → match the App Store product ids.

### 🧪 What needs testing (on a physical device)
**Auth flows** (after SMTP is set):
- Anon progress → sign up with email → confirm via link → still signed in, data intact
- Anon → Google → progress merges; same for Apple
- Email sign-in to an existing account (keep-best merge, no dup rows)
- Forgot password (cold + warm deep link) → reset → sign in
- Sign out → back to anon; Delete account → gone server-side
- Offline sign-in → blocked with a clear message (not data loss)

**Payments (sandbox):**
- Buy premium → all packs unlock → `user_entitlements.is_premium` flips via webhook → reinstall → Restore → premium returns
- Buy a single pack → downloads + playable → `owned_pack_ids` updated → persists after reinstall

**Splash / launch:** confirm on a clean **Release** build (delete app first) — no flash, no layout shift.

**Plus** the 10-step manual pass already in `TESTFLIGHT_LAUNCH.md`.

### Suggested order
1. Supabase **SMTP** + providers → run the **auth test matrix**.
2. App Store Connect IAPs + Adapty + webhook → create test packs → **sandbox purchase tests**.
3. Website deploy; rotate `.p8`.
4. Bump build number → archive **Release** → upload to TestFlight → add testers.

---

## Session commit log (branch `testflight`)

This session's work, in order (most recent last). All on the `testflight` branch;
nothing pushed.

| Commit | What |
|--------|------|
| `2aff5cf` | feat(backend): Supabase migrations + both edge functions deployed (Phase 0) |
| `932809f` | Supabase auth config pushed — anonymous on, redirect URLs, email confirmation; `authStore` deep-link handling (Phase 1) |
| `b78d649` / `d22ef33` | docs: `research.md` + `plan.md` |
| `ea5f4ad` | fix: PowerSync connector fatal-upload error logging scope (type fix) |
| `1133721` | chore(native): iOS export-compliance key, Android `starbattle://` deep link + `applicationId` rename, untrack App Store `.p8` |
| `f1ed996` | fix(splash): `@objc` bootsplash fix + `useHideAnimation` — white flash & layout shift resolved |
| _(this commit)_ | docs: plan status snapshot + this commit log |

**Not committed here:** the website (Privacy/Terms pages) lives in the separate
`starbattlefree-website` repo — deploy it from there. The App Store `.p8` is untracked
but remains in git history; **rotate it**.

---

## Phase 0 — Put the backend in version control and deploy it (P0, do first)

**Problem:** No `supabase/` directory exists. `authStore.ts` calls
`supabase.functions.invoke('migrate-anon-account')` and `supabase.rpc('delete_user')`,
and the whole entitlement model depends on an Adapty→Supabase webhook writing
`user_entitlements`. None of that is in the repo. Step one is to make the backend
reproducible and confirm it's deployed.

### 0.1 Initialize the Supabase CLI project

```bash
# from repo root
brew install supabase/tap/supabase           # if not installed
supabase init                                 # creates supabase/ with config.toml
supabase login
supabase link --project-ref <your-project-ref>   # ref is in the dashboard URL
```

This creates:

```
supabase/
  config.toml
  migrations/
  functions/
```

### 0.2 Backfill the schema as migrations

Dump the live definitions first so the migrations match reality (the tables were
made in the dashboard):

```bash
supabase db dump --schema public --file supabase/migrations/0000_baseline.sql
# also confirm the composite-id PKs and cascade FKs:
supabase db dump --data-only=false --schema auth | grep -i "references auth.users"
```

Confirm against `src/powersync/AppSchema.ts`:
- `puzzle_progress.id` PK = text `"${userId}:${puzzleId}"`
- `streaks.id` PK = text `"${userId}:${type}"`
- `user_entitlements.user_id` PK
- `ON DELETE CASCADE` from `auth.users` → `puzzle_progress`, `streaks`,
  `user_entitlements`, `streak_archive`.

If any cascade is missing, add it:

```sql
-- supabase/migrations/0001_cascades.sql
alter table public.puzzle_progress
  drop constraint if exists puzzle_progress_user_id_fkey,
  add  constraint puzzle_progress_user_id_fkey
       foreign key (user_id) references auth.users(id) on delete cascade;
-- repeat for streaks, user_entitlements
```

### 0.3 SQL: `delete_user()` (account self-deletion)

The client calls `supabase.rpc('delete_user')`. This is documented inline in
`authStore.ts` but must be deployed:

```sql
-- supabase/migrations/0002_delete_user.sql
create or replace function public.delete_user()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;
revoke execute on function public.delete_user() from public, anon;
grant  execute on function public.delete_user() to authenticated;
```

### 0.4 SQL: `migrate_anonymous_progress()` (the anon→named merge)

This is the merge the Edge Function calls. The full, reviewed version is in
`anon-account-migration-brief-v2.md`; the critical rule is **recompute the
composite `id`** to `p_named_id || ':' || key`, or later client writes create
duplicate rows.

```sql
-- supabase/migrations/0003_migrate_anonymous_progress.sql
create or replace function public.migrate_anonymous_progress(p_anon_id uuid, p_named_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_anon_id = p_named_id then return; end if;
  if not exists (select 1 from auth.users where id = p_anon_id and is_anonymous = true) then
    raise exception 'source % is not an anonymous user', p_anon_id;
  end if;

  insert into public.puzzle_progress
    (id, user_id, puzzle_id, cells, auto_marks, time_ms, completed, completed_at, updated_at)
  select p_named_id || ':' || puzzle_id, p_named_id, puzzle_id,
         cells, auto_marks, time_ms, completed, completed_at, updated_at
  from public.puzzle_progress where user_id = p_anon_id
  on conflict (id) do update set
    completed = greatest(public.puzzle_progress.completed, excluded.completed),
    cells = case
      when excluded.completed = 1 and public.puzzle_progress.completed = 0 then excluded.cells
      when excluded.completed = 1 and public.puzzle_progress.completed = 1
           and excluded.time_ms < public.puzzle_progress.time_ms then excluded.cells
      else public.puzzle_progress.cells end,
    auto_marks = case
      when excluded.completed = 1 and public.puzzle_progress.completed = 0 then excluded.auto_marks
      when excluded.completed = 1 and public.puzzle_progress.completed = 1
           and excluded.time_ms < public.puzzle_progress.time_ms then excluded.auto_marks
      else public.puzzle_progress.auto_marks end,
    time_ms = case
      when public.puzzle_progress.completed = 1 and excluded.completed = 1
           then least(public.puzzle_progress.time_ms, excluded.time_ms)
      when excluded.completed = 1 and public.puzzle_progress.completed = 0 then excluded.time_ms
      else public.puzzle_progress.time_ms end,
    completed_at = case
      when public.puzzle_progress.completed_at is null then excluded.completed_at
      when excluded.completed_at is null then public.puzzle_progress.completed_at
      else least(public.puzzle_progress.completed_at, excluded.completed_at) end,
    updated_at = greatest(public.puzzle_progress.updated_at, excluded.updated_at);

  insert into public.streaks
    (id, user_id, type, current_count, last_completed_key, updated_at)
  select p_named_id || ':' || type, p_named_id, type,
         current_count, last_completed_key, updated_at
  from public.streaks where user_id = p_anon_id
  on conflict (id) do update set
    current_count      = greatest(public.streaks.current_count, excluded.current_count),
    last_completed_key = greatest(public.streaks.last_completed_key, excluded.last_completed_key),
    updated_at         = greatest(public.streaks.updated_at, excluded.updated_at);

  delete from public.puzzle_progress where user_id = p_anon_id;
  delete from public.streaks where user_id = p_anon_id;
  delete from auth.users where id = p_anon_id and is_anonymous = true;
end;
$$;
revoke execute on function public.migrate_anonymous_progress(uuid, uuid) from public, authenticated, anon;
grant  execute on function public.migrate_anonymous_progress(uuid, uuid) to service_role;
```

### 0.5 Edge Function: `migrate-anon-account`

Verifies the caller is the named user AND owns the anon token they're migrating,
then runs the merge with the service role. Matches the exact name the client
invokes.

```ts
// supabase/functions/migrate-anon-account/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  try {
    const { anonId, anonToken } = await req.json();
    const callerAuth = req.headers.get('Authorization') ?? '';

    // 1. Caller must be a non-anonymous authenticated user (their JWT is attached
    //    automatically by supabase.functions.invoke).
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: callerAuth } },
    });
    const { data: caller } = await callerClient.auth.getUser();
    if (!caller?.user || caller.user.is_anonymous) {
      return new Response('unauthorized', { status: 401 });
    }
    const namedId = caller.user.id;

    // 2. Prove they held the anon session by validating the anon token.
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${anonToken}` } },
    });
    const { data: anon } = await anonClient.auth.getUser();
    if (!anon?.user || !anon.user.is_anonymous || anon.user.id !== anonId) {
      return new Response('forbidden', { status: 403 });
    }

    // 3. Service role runs the transactional merge + delete.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { error } = await admin.rpc('migrate_anonymous_progress', {
      p_anon_id: anonId,
      p_named_id: namedId,
    });
    if (error) return new Response(JSON.stringify(error), { status: 500 });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 400 });
  }
});
```

> Note: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are
> injected automatically into deployed functions — no manual secret needed for
> those three. This function must keep JWT verification **on** (the default) so
> `callerClient.auth.getUser()` has a verified caller.

### 0.6 Edge Function: `adapty-webhook` (writes `user_entitlements`)

This is what makes purchases persist. Adapty's webhook has **no built-in
signature**, so secure it with a shared secret in the URL/query and configure
Adapty to call `…/adapty-webhook?secret=<value>`. Disable JWT verification for
this one (Adapty isn't a Supabase user).

Key Adapty payload fields (verified): `event_type`, `customer_user_id`
(= your Supabase user id, set via `adapty.identify`), `vendor_product_id`,
`access_level_id` (present on `access_level_updated`), `store`.

```ts
// supabase/functions/adapty-webhook/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const WEBHOOK_SECRET = Deno.env.get('ADAPTY_WEBHOOK_SECRET')!;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('secret') !== WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  const e = await req.json();
  const userId: string | null = e.customer_user_id ?? null;
  if (!userId) return new Response('no customer_user_id', { status: 200 }); // anon purchase; ignore

  // Load (or default) the current entitlement row.
  const { data: row } = await admin
    .from('user_entitlements').select('*').eq('user_id', userId).maybeSingle();
  const owned: string[] = row?.owned_pack_ids ? JSON.parse(row.owned_pack_ids) : [];
  let isPremium = row?.is_premium === 1;

  const vpid: string = e.vendor_product_id ?? '';
  const grantsPremium =
    e.access_level_id === 'premium' ||
    vpid === 'sb_premium_599';
  const PACK_PREFIX = 'starbattle_pack_';

  if (['subscription_started','subscription_renewed','trial_converted',
       'access_level_updated','non_subscription_purchase'].includes(e.event_type)) {
    if (grantsPremium) isPremium = true;
    if (vpid.startsWith(PACK_PREFIX)) {
      const packId = vpid.slice(PACK_PREFIX.length);
      if (!owned.includes(packId)) owned.push(packId);
    }
  }
  if (['subscription_expired','subscription_refunded'].includes(e.event_type) &&
      e.access_level_id === 'premium') {
    isPremium = false;
  }

  await admin.from('user_entitlements').upsert({
    user_id: userId,
    is_premium: isPremium ? 1 : 0,
    owned_pack_ids: JSON.stringify(owned),
    premium_purchased_at: isPremium ? (row?.premium_purchased_at ?? new Date().toISOString()) : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
```

> ⚠️ Confirm the exact `event_type` strings and refund semantics you want against
> Adapty's event-types page before relying on this — treat the list above as a
> starting point, not gospel. The pack-vs-premium mapping must match how you set
> up access levels in Adapty (Phase 4).

### 0.7 Deploy and set secrets

```bash
supabase db push                                  # applies migrations 0000–0003
supabase functions deploy migrate-anon-account
supabase functions deploy adapty-webhook --no-verify-jwt
supabase secrets set ADAPTY_WEBHOOK_SECRET=$(openssl rand -hex 24)
# (SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY are provided automatically)
```

**Acceptance:** from the app, an anon→Google sign-in completes without error and
merged progress appears; Delete Account removes the row; a sandbox purchase causes
`user_entitlements` to update within a sync cycle.

---

## Phase 1 — Auth configuration & verification (Goal 1)

The client code is done. This phase is **dashboard config + Apple/Google developer
setup + testing**.

### 1.1 Supabase Auth dashboard

- **Enable anonymous sign-ins:** Authentication → Providers → *Anonymous* → ON.
  (Without this, `signInAnonymously()` fails at launch and nothing loads.)
- **Apple provider:** enable it and add the app bundle id
  `com.omaratechnologydesign.starbattle` to **Client IDs**. Native iOS
  `signInWithIdToken` validates the identity token's audience against that. Leave
  the Secret Key blank — it's only for the web OAuth flow, which this app doesn't use.
- **Google provider:** register **both** client IDs (`GOOGLE_WEB_CLIENT_ID` is the
  audience for the ID token; the iOS client ID is also accepted). Add both to
  "Authorized Client IDs".
- **Redirect URLs (URL Configuration):** add `starbattle://reset-password`. Also
  add `starbattle://` as the Site URL scheme so signup/recovery/email-change links
  deep-link back. `handleDeepLink` reads `access_token`/`refresh_token` from the
  URL **fragment**, so the default Supabase email templates work, but verify the
  template links point to the redirect.
- **Custom SMTP:** Authentication → Emails → SMTP Settings. **Required** — the
  built-in sender is rate-limited to a handful of emails/hour and will silently
  drop confirmation + reset emails under any real testing. Use Resend, Postmark,
  SES, etc.

### 1.2 Apple Developer

- The `com.apple.developer.applesignin` entitlement is already present, which is
  all the Apple-side setup native sign-in needs. **No Services ID, `.p8` sign-in
  key, or return URL is required** — those belong to the web OAuth flow, which this
  iOS-native app does not use.
- Because you offer Google sign-in, **Sign in with Apple is mandatory** for App
  Store approval (Guideline 4.8) — it's wired, just confirm it works on device.

### 1.3 No client code changes expected

The flows in `authStore.ts` are complete. The only optional tidy: the
password-recovery deep link currently relies on the token being in the URL
fragment. Supabase has been moving some templates to a `token_hash` + `verifyOtp`
pattern. If, during testing, the reset link does **not** populate
`access_token`/`refresh_token`, switch `handleDeepLink` to the `token_hash` flow:

```ts
// fallback if the email template uses ?token_hash=...&type=recovery
const u = new URL(url);
const tokenHash = u.searchParams.get('token_hash');
const type = u.searchParams.get('type');
if (tokenHash && type) {
  await supabase.auth.verifyOtp({ type: type as any, token_hash: tokenHash });
}
```

Keep the existing fragment parser as the primary path; only add this if the
template forces it.

### 1.4 Test matrix (physical device — see research.md §2.3)

Run all of: email signup→confirm, Google/Apple anon-merge, email sign-in to an
existing account, forgot-password (cold + warm deep link), sign out, delete
account, and the offline-sign-in guard.

---

## Phase 2 — Website legal pages (Goal 2)

Site repo: `~/Documents/starbattlefree-website` (Next.js static export, Vercel).
Routes already exist and match `src/config.ts`. Only real content + one URL.

### 2.1 Slot real Terms & Privacy text

You already have the content in the app repo: `docs/privacy-policy.md` and
`docs/terms-of-use.md`. Convert each to the page component. Example for privacy:

```tsx
// ~/Documents/starbattlefree-website/app/privacy-policy/page.tsx
export const dynamic = 'force-static';
export const metadata = {
  title: 'Privacy Policy',
  alternates: { canonical: 'https://starbattlefree.com/privacy-policy' },
};

export default function PrivacyPolicy() {
  return (
    <main className="prose mx-auto max-w-2xl px-6 py-16">
      <h1>Privacy Policy</h1>
      <p>Last updated: June 2026</p>
      {/* paste the rendered content of docs/privacy-policy.md here,
          or load it via MDX / a markdown component */}
    </main>
  );
}
```

Do the same for `app/terms-and-conditions/page.tsx` from `docs/terms-of-use.md`.
If you'd rather not hand-convert, add `@next/mdx` and import the `.md` directly —
but for two static pages, pasting the HTML is faster.

### 2.2 Set the App Store URL (after first submission)

In `app/page.tsx`, set `APP_STORE_URL` to the real listing once it exists. Not a
blocker for TestFlight.

### 2.3 Deploy

```bash
cd ~/Documents/starbattlefree-website
npm run build          # static export to ./out
git commit -am "Real privacy + terms content" && git push   # Vercel auto-deploys
```

**Acceptance:** the three URLs in `src/config.ts` resolve to real content
(App Store review checks these).

---

## Phase 3 — Splash screen parity (Goal 3)

**Problem (research.md §4.2):** native bootsplash = **white** bg + **square icon**;
`FauxSplash` = **black** (`#000000`) bg + `splashlogo.png`. Visible flash at
handoff. Goal: both identical, both using `splashlogo.png`.

### 3.1 Regenerate the native bootsplash from `splashlogo.png`

The bootsplash CLI generates iOS storyboard + Android drawables + the colorset
from one source image. `--background` and `--logo-width` are free-tier flags
(brand/dark-mode need a license key — not needed here).

```bash
# from repo root. NOTE: splashlogo.png is 4138×1948 (very wide). bootsplash
# centers a logo, so logo-width is the on-screen width in dp. FauxSplash renders
# at 85% of screen width (~327dp on a 390pt-wide iPhone). Match that.
npx react-native-bootsplash generate splashlogo.png \
  --platforms=android,ios \
  --background=000000 \
  --logo-width=320 \
  --assets-output=assets/bootsplash

cd ios && pod install && cd ..
```

This rewrites:
- `ios/StarbattleMobile/BootSplash.storyboard`
- `ios/StarbattleMobile/Colors.xcassets/BootSplashBackground-*.colorset` → black
- `ios/StarbattleMobile/Images.xcassets/BootSplashLogo-*.imageset` → `splashlogo.png`
- `assets/bootsplash/logo*.png` + `manifest.json`
- Android `res/values/colors.xml` + drawables (if `android` included)

### 3.2 Make `FauxSplash` exactly match the new native sizing

`FauxSplash.tsx` already uses `#000000` and `splashlogo.png`. The only thing to
align is **logo width** so there's no resize jump. The faux splash uses
`width: '85%'`; the native uses a dp value. Pick one source of truth — set the
faux splash to a fixed dp width equal to `--logo-width`:

```tsx
// src/components/FauxSplash.tsx — replace the logo style
logo: {
  width: 320,                 // must equal --logo-width passed to the CLI
  aspectRatio: 4138 / 1948,
},
```

(If you keep `'85%'`, verify on several device widths that it visually matches the
native logo's rendered width; a fixed dp is safer for an invisible handoff.)

### 3.3 Verify the handoff

Build Release on device, cold launch, and watch the native→faux transition.
There should be **no** color change and **no** logo resize/reposition. The
`[SB:STARTUP]` logs show `splash hiding — …` (native) before the faux splash
fades; both should be black with the same logo. The existing 8s/10s safety
timeouts need no change.

---

## Phase 4 — Payments + test packs (Goal 4)

Client code is complete. This is store/Adapty config + creating purchasable
content.

### 4.1 Decide premium's product type

`sb_premium_599` ($5.99). The paywall copy "Buy Premium · All Packs" reads like a
**one-time non-consumable unlock**, which is simplest for review and matches the
code (it only checks `accessLevels.premium.isActive`). Recommendation:
**non-consumable**. (If you ever want recurring revenue, make it an auto-renewing
subscription instead — the client needs no change, but App Store Connect + Adapty
setup and the webhook's expiry handling differ.)

### 4.2 App Store Connect — create IAPs

In App Store Connect → your app → **In-App Purchases / Subscriptions**:
- `sb_premium_599` — Non-Consumable, price tier $5.99.
- One Non-Consumable per paid pack, id **exactly** `starbattle_pack_<packId>`
  (the app derives the product from `` `starbattle_pack_${packId}` ``).
- Fill display name, description, review screenshot. Create a **Sandbox tester**
  in Users & Access for testing.

### 4.3 Adapty — products, access level, paywall, webhook

- **Products:** add each App Store product to Adapty.
- **Access level `premium`:** grant it from `sb_premium_599` (and, if you want
  premium to also cover everything, leave packs out of `premium`). The app keys
  pack ownership off `user_entitlements.owned_pack_ids`, which the webhook fills
  from `vendor_product_id` — so packs do **not** need their own Adapty access
  level, just the webhook mapping in §0.6.
- **Paywall `main_paywall`:** create it (the exact id the app fetches via
  `adapty.getPaywall('main_paywall')`) and attach every product the app references
  (`sb_premium_599` + all `starbattle_pack_*`). Give it a placement.
- **App Store Server API key:** upload `docs/SubscriptionKey_5M2LWM6WJA.p8` to
  Adapty with its Key ID + Issuer ID (server-side receipt validation / App Store
  notifications). **Then remove that `.p8` from git — it's a secret.**
  ```bash
  git rm --cached docs/SubscriptionKey_5M2LWM6WJA.p8
  echo "docs/*.p8" >> .gitignore
  git commit -m "Remove App Store API key from version control"
  ```
- **Webhook:** Adapty Dashboard → Integrations → Webhook → set URL to
  `https://<ref>.supabase.co/functions/v1/adapty-webhook?secret=<ADAPTY_WEBHOOK_SECRET>`
  and enable the purchase/access events used in §0.6.

### 4.4 Create the 3 test packs (end-to-end)

Recommended set (staggered tiers to exercise the dual-button paywall):

| id | name | grid/stars/diff | count | price |
|----|------|-----------------|-------|-------|
| `8x8-expert`     | 8×8 Expert     | 8×8 / 2★ / hard   | 30 | $1.99 |
| `10x10-challenge`| 10×10 Challenge| 10×10 / 2★ / hard | 30 | $2.99 |
| `14x14-marathon` | 14×14 Marathon | 14×14 / 3★ / hard | 20 | $3.99 |

**Step 1 — generate** the pack JSON in the exact shape the app parses
(`{id,name,version,free:false,gridSize,stars,puzzles:[{sbn,solution}]}`) plus its
hints file, mirroring the bundled packs.

**Step 2 — upload** the JSON (and hints) to the Supabase **`packs` Storage
bucket**. Note the object key → that's `storage_path`.

**Step 3 — insert the catalog row** (PowerSync syncs it down; `published=1` makes
it appear):

```sql
insert into public.packs
  (id, name, grid_size, stars, difficulty, is_free, price_usd,
   puzzle_count, storage_path, published, sort_order, type)
values
  ('8x8-expert','8×8 Expert',8,2,'hard',0,1.99,30,'8x8-expert.json',1,100,null),
  ('10x10-challenge','10×10 Challenge',10,2,'hard',0,2.99,30,'10x10-challenge.json',1,101,null),
  ('14x14-marathon','14×14 Marathon',14,3,'hard',0,3.99,20,'14x14-marathon.json',1,102,null);
```
(`type` stays `null` for library packs. `price_usd` is display-only — the real
charge comes from App Store via Adapty.)

**Step 4 — App Store + Adapty:** create `starbattle_pack_8x8-expert` etc. and
attach to `main_paywall` (§4.2–4.3). The catalog `id` and the product suffix
**must match exactly**.

### 4.5 Tidy the prefetch call-site (non-blocking)

`App.tsx` calls `prefetchAllCatalog(catalog, entitlements)` but the signature is
`prefetchAllCatalog(catalog)` (it reads entitlements from the store). Drop the
second arg in `App.tsx`'s `runTieredPrefetch`:

```ts
function runTieredPrefetch(catalog: PackCatalogItem[]): void {
  prefetchAllCatalog(catalog).catch(() => {});
}
// and update the three call sites to pass only the catalog
```

### 4.6 Sandbox test

With a Sandbox Apple ID: open paywall → buy premium → all packs unlock →
`user_entitlements.is_premium` flips after the webhook → reinstall → Restore →
premium returns. Then buy a single pack → it downloads + becomes playable →
`owned_pack_ids` contains it → reinstall → Restore/sync → still owned.

---

## Detailed TODO checklist

**Legend — who does what:**
- 👤 **YOU (dashboard/portal)** — manual work in an external console that I can't
  touch: Supabase Dashboard, Adapty, Google Cloud Console, Apple Developer,
  App Store Connect, Vercel, or your puzzle generator.
- 💻 **CODE/CLI** — work in this repo or the website repo / terminal (editing
  files, running CLIs, deploying). Can be implemented in-session or by you.
- 🧪 **TEST** — on-device or sandbox verification.

> Nothing below is implemented yet — this is the work list.

### Phase 0 — Backend in version control & deployed ✅ DONE (2026-06-02)

> Implemented against the linked project **StarbattleMobile** (`zvqdcrszalxmgtmcnevg`).
> Both functions are ACTIVE and migrations 0001–0003 are applied (verified with
> `supabase functions list` and `supabase migration list`). The generated
> `ADAPTY_WEBHOOK_SECRET` was set in Supabase secrets and is reported to you
> separately (it is NOT committed). **Heads-up:** the functions already existed in
> the project at higher versions (`migrate-anon-account` v3, `adapty-webhook` v7) —
> they were just never in the repo. They are now version-controlled and redeployed.
> Verify your existing Adapty webhook URL includes `?secret=<the new secret>` or it
> will start returning 403.

CLI / repo:
- [x] 💻 `supabase init` — created `supabase/` (config.toml, migrations, functions)
- [x] 💻 `supabase link --project-ref zvqdcrszalxmgtmcnevg`
- [ ] 💻 `supabase db dump` baseline → `0000_baseline.sql` — **skipped, needs Docker**
  (not running). Run once Docker Desktop is up for full version-control completeness;
  not required for functionality.
- [x] 💻 Add `0001_cascades.sql` (self-discovering + idempotent, §0.2)
- [x] 💻 Add `0002_delete_user.sql` (§0.3)
- [x] 💻 Add `0003_migrate_anonymous_progress.sql` (§0.4)
- [x] 💻 Write `supabase/functions/migrate-anon-account/index.ts` (§0.5)
- [x] 💻 Write `supabase/functions/adapty-webhook/index.ts` (§0.6)
- [x] 💻 `supabase db push` (0001, 0002, 0003 applied)
- [x] 💻 `supabase functions deploy migrate-anon-account`
- [x] 💻 `supabase functions deploy adapty-webhook --no-verify-jwt`
- [x] 💻 `supabase secrets set ADAPTY_WEBHOOK_SECRET=<generated>`

You (Supabase Dashboard):
- [x] 👤 Live PKs confirmed by inference — migrations applied cleanly, so the
  composite-id schema matches `AppSchema.ts`. (Explicit dashboard check optional.)
- [x] 👤 `ON DELETE CASCADE` guaranteed — `0001_cascades.sql` applied without error.
- [x] 👤 Both Edge Functions show ACTIVE and the secret is set (verified via CLI).
- [ ] 👤 **ACTION:** ensure the Adapty webhook URL carries `?secret=<new secret>`
  (this is now enforced — see Phase 4.3).

### Phase 1 — Auth configuration & verification — code done; dashboard items prepared (2026-06-02)

> Code DONE: `handleDeepLink` now handles both the implicit-grant fragment AND the
> `token_hash`/`verifyOtp` recovery flow (`src/stores/authStore.ts`); the Google iOS
> client id was verified to match `Info.plist`.
>
> Config APPLIED: `supabase config push` was run against the linked project
> (`zvqdcrszalxmgtmcnevg`) and **"Remote Auth config is up to date"** is confirmed.
> A pre-push dry-run caught that the remote already had MFA-TOTP enabled and
> `otp_length = 8` / `max_frequency = 1m`; `config.toml` was aligned to those so the
> push did **not** regress them. The only fields pushed were `site_url` and
> `additional_redirect_urls`. The **Apple + Google provider blocks were skipped**
> by the CLI because their secret env vars are unset — so providers were NOT
> changed and still require dashboard setup with real secrets.

CLI / repo:
- [x] 💻 `handleDeepLink` supports both fragment tokens and `token_hash` + `verifyOtp` (§1.3)
- [x] 💻 Verified `GOOGLE_IOS_CLIENT_ID` matches the `Info.plist` reversed-client scheme
- [x] 💻 Captured intended auth config in `supabase/config.toml`
- [x] 💻 `supabase config push` applied → site_url + redirect URLs live; MFA/OTP preserved

Supabase Auth (applied via config push):
- [x] ✅ **Anonymous sign-ins** = ON (confirmed `enable_anonymous_sign_ins = true` on remote)
- [x] ✅ **Redirect URL** `starbattle://reset-password` (+ `starbattle://`, site URL) live
- [x] ✅ **Email confirmation** = ON (confirmed on remote)

You (Supabase Dashboard → Authentication) — still require real secrets, cannot be pushed:
- [ ] 👤 Providers → **Apple**: enable + add bundle id `com.omaratechnologydesign.starbattle`
  to Client IDs; leave Secret Key blank (native sign-in — no web flow needed)
- [ ] 👤 Providers → **Google**: enable + add web client id and the iOS client id
  (`...09ejigbp1khjkk1p1dmd5kafitptkfvu`) to "Authorized Client IDs"; enable skip-nonce;
  leave Client Secret blank
- [ ] 👤 Emails → **configure custom SMTP** (Resend/Postmark/SES) — required, no credentials in repo
- [ ] 👤 Emails → confirm signup / recovery / email-change templates point at the redirect

You (Google Cloud Console):
- [x] 💻 iOS client reversed-id matches `Info.plist` (verified in repo)
- [ ] 👤 Confirm the **Web** + **iOS** OAuth clients still exist and are not deleted/restricted

### Phase 2 — Website legal pages — code done; deploy is yours (2026-06-02)

CLI / repo (`~/Documents/starbattlefree-website`):
- [x] 💻 Filled `app/privacy-policy/page.tsx` from `docs/privacy-policy.md` (full content + tables)
- [x] 💻 Filled `app/terms-and-conditions/page.tsx` from `docs/terms-of-use.md` (titled "Terms of Use")
- [x] 💻 Added table styles to `app/globals.css` (`.prose-body` had no table rules)
- [x] 💻 `npm run build` — passes, all 11 static pages generated incl. both legal routes
- [ ] 💻 Set `APP_STORE_URL` in `app/page.tsx` — deferred until the listing exists
- [ ] 👤 **Deploy:** this local clone has **no git remote** — push to your GitHub/Vercel
  pipeline (the site deploys from a repo not wired to this clone). Working-tree changes
  are staged for you; not committed (the repo has other uncommitted work).

You (Vercel):
- [ ] 👤 Confirm deploy succeeded and the 3 URLs resolve to the real content

### Phase 3 — Splash screen parity ✅ code done (2026-06-02)

> The source image had been moved to `assets/splashlogo.png`; the generate command
> was run against that path. The regen also exposed that `FauxSplash` still
> `require`d the old root `../../splashlogo.png` (now missing) — fixed to
> `../../assets/splashlogo.png`, which would otherwise have broken the bundle.

CLI / repo:
- [x] 💻 `npx react-native-bootsplash generate assets/splashlogo.png --platforms=android,ios
  --background=000000 --logo-width=320 --assets-output=assets/bootsplash` — native bg now
  black, logo is `splashlogo.png` (320×151); old `-cfef86` assets removed by the CLI
- [x] 💻 Fixed `FauxSplash.tsx` require path → `../../assets/splashlogo.png` and pinned the
  logo to exactly `320×151`pt (the native `BootSplashLogo` asset's dimensions, aspect-fit) so
  the native → faux handoff is pixel-identical with no resize/position shift
- [x] 💻 Fixed the **white flash** before the faux splash. **Root cause:** the generated
  `AppDelegate.swift` declared `func customizeRootView(_:)` **without `@objc`**; the superclass
  satisfies that protocol method with a default impl invisible to Swift, so the method was never
  registered with the ObjC runtime and RN's `[delegate customizeRootView:]` never reached it —
  meaning **`RNBootSplash.initWithStoryboard(...)` never ran and the native splash was never
  held.** The "splash" was only ever the JS twin, with an unbridged ~50ms white gap at launch.
  Fix: mark it `@objc` (no `override`/`super` — Swift can't see the base method). Confirmed via
  `BootSplash.isVisible()===true`. Splash architecture: `FauxSplash` is a `BootSplash.useHideAnimation()`
  JS twin (pixel-matched via `manifest.json` + `logo.png`), rendered above the navigator in
  `App.tsx`; the hook hides the native splash only after the twin lays out, then cross-fades.
  Reveal gated on `splashStore.homeReady`. Also: `AppDelegate` sets window + rootVC.view + rootView
  backgrounds black (defensive); manual `BootSplash.hide()` + 8s race removed from `App.tsx`.
- [x] 💻 Fixed the post-splash **layout shift**: `markHomeReady` now waits for the screen to stay
  loaded for 400ms (debounced) before revealing, so late-syncing packs don't pop in after the
  splash lifts. Native `AppDelegate` change needs a **clean rebuild + app delete**.
- [ ] 💻 `pod install` — **not needed** (asset-catalog regen only; no CocoaPods change)
- [ ] 👤 Android note: the wide logo exceeds Android's 192dp splash limit, so Android shows
  the black background only (no logo). Fine for iOS-first TestFlight; revisit for Android.

Test:
- [ ] 🧪 Cold-launch Release on device: no color change, no logo resize at handoff

### Phase 4 — Payments + test packs

You (App Store Connect):
- [ ] 👤 Decide premium type = **non-consumable** (recommended) and create
  `sb_premium_599` ($5.99)
- [ ] 👤 Create one **non-consumable** per pack: `starbattle_pack_8x8-expert`,
  `starbattle_pack_10x10-challenge`, `starbattle_pack_14x14-marathon`
- [ ] 👤 Fill names/descriptions/review screenshots for each IAP
- [ ] 👤 Create a **Sandbox tester** (Users & Access)

You (Adapty Dashboard):
- [ ] 👤 Add every App Store product to Adapty
- [ ] 👤 Configure access level **`premium`** granted by `sb_premium_599`
- [ ] 👤 Create paywall **`main_paywall`** with a placement; attach all products
- [ ] 👤 Upload the App Store Server API key (`.p8`) with Key ID + Issuer ID
- [ ] 👤 Integrations → Webhook → URL
  `https://<ref>.supabase.co/functions/v1/adapty-webhook?secret=<secret>`;
  enable purchase/access events
- [ ] 👤 Confirm the webhook `event_type` strings match those handled in §0.6

CLI / repo (DONE 2026-06-02):
- [x] 💻 `git rm --cached docs/SubscriptionKey_5M2LWM6WJA.p8` (still on disk for Adapty
  upload); added `*.p8` to `.gitignore` (`git check-ignore` confirms)
- [ ] 👤 **Rotate the key** — `git rm --cached` does not purge it from git *history*. Since
  it was already committed, revoke the old App Store Connect API key and issue a new one.
- [x] 💻 Tidied `prefetchAllCatalog` call-site in `App.tsx` (dropped 2nd arg + unused
  `Entitlements` import; fixed the `Expected 1 arguments, but got 2` typecheck error, §4.5)

You (puzzle generator) + Supabase:
- [ ] 👤 Generate the 3 pack JSONs (+ hints) in the required shape (§4.4)
- [ ] 👤 Upload each JSON (+ hints) to the Supabase **`packs` Storage bucket**
- [ ] 💻/👤 Run the `INSERT INTO public.packs …` catalog rows (§4.4 SQL — via SQL
  editor or `supabase db`)

Test (sandbox):
- [ ] 🧪 Buy premium → all packs unlock → `user_entitlements.is_premium` flips →
  reinstall → Restore → premium returns
- [ ] 🧪 Buy a single pack → downloads + playable → `owned_pack_ids` updated →
  reinstall → Restore/sync → still owned

### Phase 5 — Native configuration audit (2026-06-02)

Already correct (no action): `PrivacyInfo.xcprivacy` is complete and in the build
target (required-reason APIs + collected data types, non-tracking); ATS secure
(`NSAllowsArbitraryLoads=false`); Sign in with Apple entitlement; AppIcon set;
Android `INTERNET` permission; `allowBackup=false`.

Done this session:
- [x] 💻 iOS: added `ITSAppUsesNonExemptEncryption = false` to `Info.plist` — removes
  the "Missing Compliance" prompt on every TestFlight upload (app uses only standard
  HTTPS/TLS, which is export-exempt). Validated with `plutil -lint`.
- [x] 💻 Android: added the `starbattle://` deep-link intent-filter to
  `AndroidManifest.xml` (VIEW + DEFAULT + BROWSABLE) so password-reset deep links open
  the app on Android, mirroring the iOS URL scheme. Validated as well-formed XML.
- [x] 💻 Android: renamed `applicationId` **and** `namespace` from the default
  `com.starbattlemobile` to `com.omaratechnologydesign.starbattle` (matches the iOS bundle):
  updated `build.gradle`, moved the Kotlin source to
  `java/com/omaratechnologydesign/starbattle/`, and updated both `package` declarations.
  `AndroidManifest` uses relative `.MainActivity`/`.MainApplication`, so it needed no change.
  No stray `com.starbattlemobile` references remain. (Run a clean Android build to regenerate
  `BuildConfig`/`R` under the new namespace.)
- [x] 💻 Fixed the 5 remaining pre-existing typecheck errors (out-of-plan): `Connector.ts`
  now tracks `lastOp` for fatal-error logging (was referencing the loop var `op` out of
  scope); `HomeScreen.getStreakLabel` takes `StreakType` instead of `string`. **`tsc` is now
  at 0 errors.**

You (iOS, App Store Connect / Xcode):
- [ ] 👤 Increment `CURRENT_PROJECT_VERSION` (build number) on **every** TestFlight upload
  (currently `1`; `MARKETING_VERSION` is `1.0`).
- [ ] 👤 Confirm the `AppIcon` set includes the 1024×1024 App Store marketing icon.

You (Android — lower priority, iOS-first; not needed for TestFlight):
- [ ] 👤 Register the Android OAuth client for the new package
  `com.omaratechnologydesign.starbattle` + the release keystore's **SHA-1/SHA-256** in Google
  Cloud Console (the `applicationId` rename above is done; this is the coordinated half).
- [ ] 👤 Create a real **release keystore** + signing config (release currently signs with
  the debug keystore).

### Final verification & ship

Test:
- [ ] 🧪 Full auth matrix on device (research.md §2.3)
- [ ] 🧪 The 10-step manual plan in `TESTFLIGHT_LAUNCH.md`

You (App Store Connect):
- [ ] 👤 Privacy nutrition labels, age rating, encryption (ITSAppUsesNonExemptEncryption) declaration
- [ ] 👤 App icon, screenshots, description, support URL
- [ ] 💻 Archive a Release build (Xcode) → upload to TestFlight
- [ ] 👤 Add internal testers in TestFlight and distribute

---

## Consolidated execution order

1. **Phase 0** — backend in version control + deployed (`migrate-anon-account`,
   `delete_user`, `migrate_anonymous_progress`, `adapty-webhook`). *Blocks auth &
   payments.*
2. **Phase 1** — Supabase Auth dashboard (anonymous ON, providers, redirect URLs,
   **custom SMTP**) + Apple/Google developer config.
3. **Phase 4 store setup** — App Store Connect IAPs + Adapty products/paywall/
   webhook + remove the `.p8` from git.
4. **Phase 3** — regenerate native bootsplash from `splashlogo.png` + match faux
   splash width.
5. **Phase 2** — real Terms/Privacy on the website.
6. **Create 3 test packs** (Phase 4.4).
7. **Full device test pass** — auth matrix (research.md §2.3), sandbox purchases,
   splash handoff, plus the 10-step manual plan already written in
   `TESTFLIGHT_LAUNCH.md`.
8. Archive a Release build and upload to TestFlight.

---

## Sources

- react-native-bootsplash CLI (`generate`, `--background`, `--logo-width`,
  `--assets-output`): [zoontek/react-native-bootsplash docs](https://github.com/zoontek/react-native-bootsplash)
- Adapty webhook event types & fields (`customer_user_id`, `vendor_product_id`,
  `access_level_id`, `event_type`): [Adapty Webhook docs](https://adapty.io/docs/webhook) ·
  [Event types & fields](https://adapty.io/docs/webhook-event-types-and-fields)
- Supabase Edge Function auth (verifying user JWT, service-role client):
  [Securing Edge Functions](https://supabase.com/docs/guides/functions/auth)
- Supabase password-recovery deep linking / `verifyOtp` / `PASSWORD_RECOVERY`:
  [Native Mobile Deep Linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking) ·
  [resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- Adapty users & `customer_user_id` mapping: [Users & Access (React Native)](https://adapty.io/docs/react-native-user)
