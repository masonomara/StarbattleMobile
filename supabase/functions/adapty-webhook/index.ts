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

interface EntitlementRow {
  user_id: string;
  is_premium: number;
  premium_purchased_at: string | null;
  owned_pack_ids: string | null;
}

function parseOwned(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  if (url.searchParams.get('secret') !== WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  const event = (await req.json()) as AdaptyEvent;
  const userId = event.customer_user_id;
  if (!userId) {
    return new Response(JSON.stringify({ ok: true, skipped: 'anonymous' }), { status: 200 });
  }

  const { data: row } = await admin
    .from('user_entitlements')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle<EntitlementRow>();

  const owned = parseOwned(row?.owned_pack_ids ?? null);
  let isPremium = row?.is_premium === 1;

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
      is_premium: isPremium ? 1 : 0,
      owned_pack_ids: JSON.stringify(owned),
      premium_purchased_at: premiumPurchasedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    return new Response(JSON.stringify(error), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
