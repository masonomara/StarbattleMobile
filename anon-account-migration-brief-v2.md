# Implementation Brief v2 (FINAL): Anonymous → Named Account Progress Migration

**Supersedes v1.** Rewritten against the actual codebase investigation. For Claude Code working in this repo (Supabase + PowerSync + React Native).

Read the whole brief first. One thing still needs confirmation from the live DB before the SQL is final — see step 0.

---

## Decisions already made (do not re-litigate these)

1. **Keep native `signInWithIdToken` for Google/Apple.** Do NOT switch to `linkIdentity`. The user IDs will differ after sign-in (named ≠ anon), so we migrate server-side. One mechanism handles both new and existing named accounts.
2. **One server-side merge**, invoked via an Edge Function that proves the caller owned the anon session. Replaces the three `deleteAnonymousUser(anonId)` calls.
3. **Migrate only `puzzle_progress` and `streaks`.** Leave `user_entitlements` and `streak_archive` untouched (reasons below).
4. **Fix two latent data-loss bugs as part of this work** — they will lose/corrupt data regardless of the migration (see "Prerequisite fixes"). These are not optional.

---

## Step 0 — Confirm before finalizing SQL

The four tables were created via the Supabase Dashboard; no `CREATE TABLE` SQL is in the repo. Dump the real definitions (`\d+ puzzle_progress` etc. via the SQL editor or `psql`) and confirm:

- **`puzzle_progress` PK is the composite text `id`** (the connector upserts `{ ...op.opData, id: op.id }` where `op.id` = `${userId}:${puzzleId}`). Confirm whether there's *also* a `UNIQUE(user_id, puzzle_id)`. The `ON CONFLICT` target below assumes the PK is `id`.
- **`streaks` PK is the composite text `id`** = `${userId}:${type}`.
- **`user_entitlements` PK is `user_id`** (PowerSync row id is just the userId).
- The **FK `ON DELETE CASCADE`** from `auth.users` to these tables (referenced in an `authStore.ts` comment) — confirm it exists; the merge relies on deleting the anon `auth.users` row to clean up.

While here, backfill these `CREATE TABLE` definitions, the existing `delete_anonymous_user` function, and the new migration function into `supabase/migrations/` so they're version-controlled, then `supabase db push`.

---

## Why entitlements and streak_archive are NOT migrated

**`user_entitlements`:** written exclusively by a server-side Adapty webhook and synced down; the client never writes it (`setIsPremium`/`addOwnedPack` mutate Zustand only). `applySignIn` already calls `adapty.identify(namedId)`, and Adapty merges the anonymous profile's purchases into the named profile, so the webhook writes the correct named-user row. Copying the anon row in SQL would conflict with Adapty's source of truth. → **The merge function must not touch this table.** After sign-in, just ensure `loadEntitlements(namedId)` re-runs once the named row has synced.
> Confirm with the user: can anonymous users make purchases at all? If the paywall requires sign-in, this is entirely moot.

**`streak_archive`:** global, no `user_id` column, read-only from the client, syncs under the `global_packs` bucket. It's the "which puzzle was featured each date" calendar, not per-user progress. → **Nothing to migrate.**

---

## The critical composite-id detail

PowerSync row ids are `${userId}:${puzzleId}` (puzzle_progress) and `${userId}:${type}` (streaks), stored in the `id` column the client constructs on every write. If the merge keeps an anon row's old `id` (`anonId:X`) while changing `user_id` to `namedId`, the next time the client writes puzzle X it computes `namedId:X` and inserts a **duplicate** row. So the merge MUST recompute `id = p_named_id || ':' || <key>` and conflict-target the new `id`.

---

## Server side: SQL merge function

Add to `supabase/migrations/`. `SECURITY DEFINER`, owned by a role with delete rights on `auth.users` (same privilege level as the existing `delete_anonymous_user`). Callable by `service_role` only. Adjust column names to match the confirmed schema.

```sql
create or replace function public.migrate_anonymous_progress(p_anon_id uuid, p_named_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Defense in depth (the Edge Function already verified ownership of the anon session).
  if p_anon_id = p_named_id then
    return;
  end if;
  if not exists (select 1 from auth.users where id = p_anon_id and is_anonymous = true) then
    raise exception 'source % is not an anonymous user', p_anon_id;
  end if;

  -- puzzle_progress: recompute composite id, prefer completed, then the better attempt.
  insert into public.puzzle_progress
    (id, user_id, puzzle_id, cells, auto_marks, time_ms, completed, completed_at, updated_at)
  select p_named_id || ':' || puzzle_id, p_named_id, puzzle_id,
         cells, auto_marks, time_ms, completed, completed_at, updated_at
  from public.puzzle_progress
  where user_id = p_anon_id
  on conflict (id) do update set
    completed  = greatest(public.puzzle_progress.completed, excluded.completed),
    cells      = case
                   when excluded.completed = 1 and public.puzzle_progress.completed = 0 then excluded.cells
                   when excluded.completed = 1 and public.puzzle_progress.completed = 1
                        and excluded.time_ms < public.puzzle_progress.time_ms then excluded.cells
                   else public.puzzle_progress.cells end,
    auto_marks = case
                   when excluded.completed = 1 and public.puzzle_progress.completed = 0 then excluded.auto_marks
                   when excluded.completed = 1 and public.puzzle_progress.completed = 1
                        and excluded.time_ms < public.puzzle_progress.time_ms then excluded.auto_marks
                   else public.puzzle_progress.auto_marks end,
    time_ms    = case
                   when public.puzzle_progress.completed = 1 and excluded.completed = 1
                        then least(public.puzzle_progress.time_ms, excluded.time_ms)
                   when excluded.completed = 1 and public.puzzle_progress.completed = 0 then excluded.time_ms
                   else public.puzzle_progress.time_ms end,
    -- completed_at is set-once; keep the earliest non-null.
    completed_at = case
                     when public.puzzle_progress.completed_at is null then excluded.completed_at
                     when excluded.completed_at is null then public.puzzle_progress.completed_at
                     else least(public.puzzle_progress.completed_at, excluded.completed_at) end,
    updated_at = greatest(public.puzzle_progress.updated_at, excluded.updated_at);

  -- streaks: recompute composite id, take the stronger streak (heuristic — there is no
  -- per-user archive to recompute from, since streak_archive is global).
  insert into public.streaks
    (id, user_id, type, current_count, last_completed_key, updated_at)
  select p_named_id || ':' || type, p_named_id, type,
         current_count, last_completed_key, updated_at
  from public.streaks
  where user_id = p_anon_id
  on conflict (id) do update set
    current_count      = greatest(public.streaks.current_count, excluded.current_count),
    last_completed_key = greatest(public.streaks.last_completed_key, excluded.last_completed_key),
    updated_at         = greatest(public.streaks.updated_at, excluded.updated_at);

  -- Remove the anon-keyed source rows, then the anon user (cascade cleans anything left).
  delete from public.puzzle_progress where user_id = p_anon_id;
  delete from public.streaks where user_id = p_anon_id;
  delete from auth.users where id = p_anon_id and is_anonymous = true;
end;
$$;

revoke execute on function public.migrate_anonymous_progress(uuid, uuid) from public, authenticated, anon;
grant  execute on function public.migrate_anonymous_progress(uuid, uuid) to service_role;
```

> The "better attempt" rule (faster `time_ms` wins when both completed) and the `current_count` max are **product decisions**. Confirm with the user before finalizing. ISO-8601 text timestamps sort correctly with `least`/`greatest`, so those comparisons are valid as written.

---

## Server side: Edge Function (`supabase/functions/migrate-anon-account/index.ts`)

Security: an authenticated user must not be able to migrate an arbitrary anon user's progress into their own account. Prove the caller held the anon session by passing the anon access token (captured client-side *before* sign-in) and verifying it here.

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const { anonId, anonToken } = await req.json();
  const callerAuth = req.headers.get('Authorization') ?? '';

  // Caller = the named user (their JWT is attached by supabase.functions.invoke).
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: callerAuth } },
  });
  const { data: caller } = await callerClient.auth.getUser();
  if (!caller?.user || caller.user.is_anonymous) return new Response('unauthorized', { status: 401 });
  const namedId = caller.user.id;

  // Verify the anon token really is the anonymous user they claim.
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${anonToken}` } },
  });
  const { data: anon } = await anonClient.auth.getUser();
  if (!anon?.user || !anon.user.is_anonymous || anon.user.id !== anonId) {
    return new Response('forbidden', { status: 403 });
  }

  // Service role runs the transactional merge + delete.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error } = await admin.rpc('migrate_anonymous_progress', {
    p_anon_id: anonId,
    p_named_id: namedId,
  });
  if (error) return new Response(JSON.stringify(error), { status: 500 });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
```

---

## Prerequisite fixes (REQUIRED — independent of the merge, both currently lose/corrupt data)

### Fix A — Drain the PowerSync upload queue before sign-in
Currently nothing flushes the CRUD queue before `signInWithIdToken` / `signInWithPassword`. Unsynced anon writes reference the anon user; after it's deleted they fail to upload and are silently dropped by the `isFatal()` 23xxx handler. The merge reads Supabase, so anon writes must reach Supabase first.

Add a helper that, while still anonymous and online, polls `database.getUploadQueueStats()` until the pending count is 0, with a timeout (e.g. 10s). If it can't drain (offline), **abort the sign-in** with a "connect to the internet and try again" message — do not proceed to sign-in/merge/delete with a non-empty queue.

### Fix B — Switch PowerSync to the named user after the merge
`connect()` is called once at startup; `disconnectAndClear()` / `waitForFirstSync()` are never called. After sign-in PowerSync keeps the cached anon token and never rebuilds local SQLite for the new user, so merged rows won't appear and two users' data can coexist locally. After the merge succeeds:

```ts
await powersync.disconnectAndClear();   // wipes local; prevents anon rows re-uploading under the named token
await powersync.connect(connector);     // fetchCredentials now returns the named session token
await powersync.waitForFirstSync();     // local DB rebuilt from merged named buckets
await loadEntitlements(namedId);
```

---

## Client flow (apply to Google, Apple, and email sign-IN — not email sign-up)

In `src/stores/authStore.ts`, the three sign-in actions become (sketch — adapt to each provider's token acquisition):

```ts
// 1. Preconditions: must be anonymous + online + queue drainable.
const anonId = get().isAnonymous ? (get().user?.id ?? null) : null;
const anonToken = (await supabase.auth.getSession()).data.session?.access_token ?? null;
await drainUploadQueue(); // Fix A; throws/aborts if it can't drain

// 2. Native sign-in (unchanged per provider).
const { data, error } = await supabase.auth.signInWithIdToken({ provider, token }); // or signInWithPassword
if (error) throw error;
await applySignIn(set, data.session, data.user); // existing: sets isAnonymous false, adapty.identify(namedId)
const namedId = data.user.id;

// 3. Migrate server-side (skip if somehow same id, e.g. in-place).
if (anonId && anonToken && namedId !== anonId) {
  const { error: mErr } = await supabase.functions.invoke('migrate-anon-account', {
    body: { anonId, anonToken },
  });
  if (mErr) throw mErr; // surface to UI; do NOT silently swallow like the old delete did
}

// 4. Switch PowerSync to the named user (Fix B).
await powersync.disconnectAndClear();
await powersync.connect(connector);
await powersync.waitForFirstSync();
await loadEntitlements(namedId);
```

- **Remove** the three `deleteAnonymousUser(anonId)` calls — deletion now happens inside the merge function, only after a successful merge. Remove the `deleteAnonymousUser` helper if unused elsewhere. (`delete_user()` for full account self-deletion is unrelated; leave it.)
- **Email sign-UP** (`updateUser`) is unchanged — it's in-place (same id), already preserves progress, and `namedId === anonId` so the migrate step no-ops. Leave it.
- Don't swallow migration errors. The old code silently ignored delete failures; a failed *merge* must surface so the user isn't left thinking progress transferred when it didn't. On failure, the anon user is still intact (merge is transactional and deletes last), so a retry is safe.

---

## UX / alert changes (`src/components/SettingsModal.tsx`)

The migration is now additive and non-destructive (union + keep-best, even when merging into an existing account). **Remove the "Replace Anonymous Progress? … This cannot be undone" alert from all three paths.** Optionally show a neutral progress state ("Combining your progress…") while the drain → sign-in → merge → re-sync sequence runs, since it now involves a server round-trip and a full re-sync.

---

## Test checklist

1. New Google account from anon progress → all puzzles/streaks present under the new user; anon user deleted; no duplicate `id` rows after a subsequent write to a migrated puzzle.
2. New Apple account → same.
3. Email sign-in to a NEW-ish account → same.
4. Email sign-UP → unchanged, in-place, progress intact, migrate step no-ops.
5. Sign into an EXISTING account where both sides have the same puzzle → keep-best applied, no PK violation, no dup rows.
6. Streaks merged → stronger streak retained.
7. Entitlements → named account's premium NOT clobbered; after `adapty.identify` + webhook, entitlements correct; brief pre-sync window handled gracefully.
8. **Fix A:** make local anon writes, go offline, attempt sign-in → blocked with a clear message; back online → writes upload, then migrate succeeds with nothing lost.
9. **Fix B:** after sign-in, local DB shows only the named user's (merged) data; no leftover anon rows; UI waits for first sync before reading.
10. **Security:** Edge Function rejects a forged `anonId`, a non-anonymous `anonToken`, and an unauthenticated caller.

---

## Decisions to confirm with the user

- Puzzle conflict rule when completed on both accounts: faster `time_ms` wins? (assumed yes)
- Streaks: `greatest(current_count)` heuristic acceptable, or do you want exact recomputation? (no per-user archive exists, so exact is hard)
- Can anonymous users make purchases? (determines whether the entitlements hands-off matters at all)
- Confirm the Step 0 schema facts (composite `id` PKs, `user_entitlements` PK = `user_id`, FK CASCADE present).
