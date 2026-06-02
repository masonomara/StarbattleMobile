import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface MigrateRequest {
  anonId: string;
  anonToken: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    const { anonId, anonToken } = (await req.json()) as MigrateRequest;
    if (!anonId || !anonToken) {
      return new Response('bad request', { status: 400 });
    }

    const callerAuth = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: callerAuth } },
    });
    const { data: caller } = await callerClient.auth.getUser();
    if (!caller.user || caller.user.is_anonymous) {
      return new Response('unauthorized', { status: 401 });
    }
    const namedId = caller.user.id;

    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${anonToken}` } },
    });
    const { data: anon } = await anonClient.auth.getUser();
    if (!anon.user || !anon.user.is_anonymous || anon.user.id !== anonId) {
      return new Response('forbidden', { status: 403 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { error } = await admin.rpc('migrate_anonymous_progress', {
      p_anon_id: anonId,
      p_named_id: namedId,
    });
    if (error) {
      return new Response(JSON.stringify(error), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: message }), { status: 400 });
  }
});
