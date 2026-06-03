import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const WEBHOOK_SECRET = Deno.env.get('ADAPTY_WEBHOOK_SECRET')!;

const PACK_PREFIX = 'starbattle_pack_';
const PREMIUM_PRODUCT_ID = 'sb_premium_599';
const PREMIUM_ACCESS_LEVEL = 'premium';

const GRANT_EVENTS = [
  'subscription_started',
  'subscription_renewed',
  'trial_converted',
  'access_level_updated',
  'non_subscription_purchase',
];
const REVOKE_EVENTS = ['subscription_expired', 'subscription_refunded'];

interface AdaptyEvent {
  event_type: string;
  customer_user_id: string | null;
  vendor_product_id: string | null;
  access_level_id: string | null;
}

// Postgres column types: is_premium boolean, owned_pack_ids text[]. supabase-js
// returns/accepts these as native JS boolean and array (not the 1/0 + JSON-string
// representation PowerSync syncs down to the client's SQLite).
interface EntitlementRow {
  user_id: string;
  is_premium: boolean;
  premium_purchased_at: string | null;
  owned_pack_ids: string[] | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  if (url.searchParams.get('secret') !== WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  const event = (await req.json()) as AdaptyEvent;
  console.log(
    `[adapty-webhook] ${event.event_type} user=${event.customer_user_id} product=${event.vendor_product_id}`,
  );

  const userId = event.customer_user_id;
  if (!userId) {
    return new Response(JSON.stringify({ ok: true, skipped: 'anonymous' }), { status: 200 });
  }

  const { data: row } = await admin
    .from('user_entitlements')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle<EntitlementRow>();

  const owned: string[] = row && Array.isArray(row.owned_pack_ids) ? row.owned_pack_ids : [];
  let isPremium = row?.is_premium === true;

  const vendorProductId = event.vendor_product_id ?? '';
  const grantsPremium =
    event.access_level_id === PREMIUM_ACCESS_LEVEL || vendorProductId === PREMIUM_PRODUCT_ID;

  if (GRANT_EVENTS.includes(event.event_type)) {
    if (grantsPremium) isPremium = true;
    if (vendorProductId.startsWith(PACK_PREFIX)) {
      const packId = vendorProductId.slice(PACK_PREFIX.length);
      if (!owned.includes(packId)) owned.push(packId);
    }
  } else if (REVOKE_EVENTS.includes(event.event_type) && event.access_level_id === PREMIUM_ACCESS_LEVEL) {
    isPremium = false;
  }

  const premiumPurchasedAt = isPremium
    ? row?.premium_purchased_at ?? new Date().toISOString()
    : null;

  const { error } = await admin.from('user_entitlements').upsert(
    {
      user_id: userId,
      is_premium: isPremium,
      owned_pack_ids: owned,
      premium_purchased_at: premiumPurchasedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.error('[adapty-webhook] upsert failed:', error);
    return new Response(JSON.stringify(error), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
