import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let anonId: string | undefined;
  let anonToken: string | undefined;
  try {
    ({ anonId, anonToken } = await req.json());
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!anonId || !anonToken) {
    return json({ error: 'Missing anonId or anonToken' }, 400);
  }

  // ── Verify caller is the named (non-anonymous) user ───────────────────────
  // supabase.functions.invoke on the client automatically attaches the current
  // session JWT as the Authorization header. At call time applySignIn has
  // already run, so this JWT belongs to the named account.
  const callerAuth = req.headers.get('Authorization') ?? '';
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: callerAuth } },
    auth: { persistSession: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user || callerData.user.is_anonymous) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const namedId = callerData.user.id;

  // ── Verify the anonToken actually belongs to the claimed anonymous user ───
  // This prevents a named user from migrating an arbitrary anon account's
  // progress into their own by supplying a fabricated anonId.
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${anonToken}` } },
    auth: { persistSession: false },
  });
  const { data: anonData, error: anonError } = await anonClient.auth.getUser();
  if (
    anonError ||
    !anonData.user ||
    !anonData.user.is_anonymous ||
    anonData.user.id !== anonId
  ) {
    return json({ error: 'Forbidden: invalid anonymous token' }, 403);
  }

  // ── Run the transactional merge + delete as service_role ──────────────────
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { error: mergeError } = await admin.rpc('migrate_anonymous_progress', {
    p_anon_id: anonId,
    p_named_id: namedId,
  });
  if (mergeError) {
    return json({ error: mergeError.message }, 500);
  }

  return json({ ok: true }, 200);
});
