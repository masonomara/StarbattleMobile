import { adapty } from 'react-native-adapty';
import type { AdaptyPaywallProduct, AdaptyProfile } from 'react-native-adapty';
import { downloadPack } from '../../packs';
import { useEntitlementsStore } from '../stores/entitlementsStore';
import { prefetchAllCatalog } from '../../packs/prefetch';
import i18n from './i18n';
import { UserFacingError } from './errors';
import { track } from './telemetry';
import type { Entitlements } from '../../types';

const PACK_PREFIX = 'starbattle_pack_';

// Derives effective entitlements from an Adapty profile (the StoreKit receipt).
// Premium comes from the `premium` access level (granted by sb_premium_599);
// individual packs come from non-subscription purchases whose vendorProductId is
// starbattle_pack_<id> and that haven't been refunded. Mirrors the server-side
// adapty-webhook so device-derived state matches what a named account syncs down.
function deriveEntitlements(profile: AdaptyProfile): Entitlements {
  const premium = profile.accessLevels?.premium;
  const ownedPackIds: string[] = [];
  for (const [vendorProductId, entries] of Object.entries(
    profile.nonSubscriptions ?? {},
  )) {
    if (!vendorProductId.startsWith(PACK_PREFIX)) continue;
    if (entries.some(e => !e.isRefund)) {
      ownedPackIds.push(vendorProductId.slice(PACK_PREFIX.length));
    }
  }
  return {
    isPremium: premium?.isActive ?? false,
    premiumPurchasedAt: premium?.activatedAt?.toISOString(),
    ownedPackIds,
  };
}

function applyProfile(profile: AdaptyProfile): void {
  useEntitlementsStore.getState().setDeviceEntitlements(deriveEntitlements(profile));
}

// Reads the current Adapty profile and refreshes the device entitlements slice.
// Call on startup and foreground so a purchase made on this device — including by
// an anonymous user who never registered — is honored across app restarts. Adapty
// validates the StoreKit receipt, which is tied to the Apple ID rather than our
// account, so no sign-in is required (App Review 5.1.1(v)). Safe offline: Adapty
// returns its cached profile; a failure leaves the existing device state intact.
export async function syncEntitlementsFromAdapty(): Promise<void> {
  try {
    applyProfile(await adapty.getProfile());
  } catch {
    // No profile yet (SDK not activated / offline first launch) — a later sync
    // or a purchase will populate the device entitlements.
  }
}

// NOTE: _productsPromise caches the paywall products for the lifetime of the
// process. If Adapty's paywall configuration changes server-side (e.g. price
// update, new product added), the app must be restarted to pick up the change.
// This is acceptable for current usage (prices rarely change mid-session) but
// worth noting for a future "refresh paywall" feature.
let _productsPromise: Promise<AdaptyPaywallProduct[]> | null = null;

async function getProducts(): Promise<AdaptyPaywallProduct[]> {
  if (!_productsPromise) {
    _productsPromise = adapty.getPaywall('main_paywall')
      .then(paywall => adapty.getPaywallProducts(paywall))
      .catch(e => { _productsPromise = null; throw e; });
  }
  return _productsPromise;
}

export async function getLocalizedPrice(vendorProductId: string): Promise<string | null> {
  try {
    const products = await getProducts();
    return products.find(p => p.vendorProductId === vendorProductId)?.price?.localizedString ?? null;
  } catch {
    return null;
  }
}

export const PREMIUM_PRODUCT_ID = 'sb_premium_599';

type PurchaseOutcome = 'success' | 'failed' | 'cancelled' | 'lag';

// Mirrors useAsyncAction's toUserMessage(): Adapty surfaces a user-cancelled
// purchase via these store error codes. Keep in sync with that list.
function isCancellation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes('1001') || // Apple: user cancelled
    msg.includes('12501') || // Google: user cancelled
    msg.includes('The user canceled')
  );
}

function errReason(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.slice(0, 80);
}

// Wraps a purchase with funnel telemetry: one purchase_initiated when the user
// commits, then exactly one purchase_result carrying the outcome and elapsed
// time. Fire-and-forget — it never changes the value returned or the error
// thrown to the UI. `body` records the precise outcome for its known exits
// (cancel/lag/store-failure); the catch records anything else and re-throws.
async function instrumentPurchase<T>(
  base: {
    kind: 'premium' | 'pack';
    product_id: string;
    pack?: string;
    // Which surface initiated this purchase — premium can start from the paywall
    // modal OR the Settings upgrade button (where the streak-archive gate routes,
    // via openSettings). Settings-originated purchases have no paywall_shown, so
    // `source` is the only honest way to split the membership funnel by surface
    // and to attribute archive→purchase. See BASELINE.md §5.1.
    source?: string;
  },
  body: (record: (outcome: PurchaseOutcome, reason?: string) => void) => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  track('purchase_initiated', { meta: { ...base } });
  let recorded = false;
  const record = (outcome: PurchaseOutcome, reason?: string) => {
    if (recorded) return;
    recorded = true;
    track('purchase_result', {
      duration_ms: Date.now() - t0,
      meta: { ...base, outcome, ...(reason ? { reason } : {}) },
    });
  };
  try {
    const out = await body(record);
    record('success');
    return out;
  } catch (e) {
    record(isCancellation(e) ? 'cancelled' : 'failed', errReason(e));
    throw e;
  }
}

export async function purchasePremium(
  source: 'paywall' | 'settings' | 'archive' | 'unknown' = 'unknown',
): Promise<boolean> {
  return instrumentPurchase(
    { kind: 'premium', product_id: PREMIUM_PRODUCT_ID, source },
    async record => {
      const products = await getProducts();
      const product = products.find(
        p => p.vendorProductId === PREMIUM_PRODUCT_ID,
      );
      if (!product) {
        record('failed', 'product_unavailable');
        throw new UserFacingError(i18n.t('errors.productUnavailable'));
      }

      const result = await adapty.makePurchase(product);
      if (result.type !== 'success') {
        const rt = result.type as string;
        record(rt === 'user_cancelled' ? 'cancelled' : 'failed', rt);
        throw new UserFacingError(i18n.t('errors.purchaseFailed'));
      }
      if (!(result.profile.accessLevels?.premium?.isActive ?? false)) {
        // Store reported success but Adapty's webhook hasn't activated the
        // entitlement yet — the user paid; a retry usually resolves it.
        record('lag', 'entitlement_inactive');
        throw new UserFacingError(i18n.t('errors.purchaseLag'));
      }
      applyProfile(result.profile);
      const { packCatalog } = useEntitlementsStore.getState();
      prefetchAllCatalog(packCatalog).catch(() => {});
      return true;
    },
  );
}

export async function purchasePack(
  packId: string,
  storagePath: string,
): Promise<void> {
  await instrumentPurchase(
    { kind: 'pack', product_id: `starbattle_pack_${packId}`, pack: packId },
    async record => {
      const products = await getProducts();
      const product = products.find(
        p => p.vendorProductId === `starbattle_pack_${packId}`,
      );
      if (!product) {
        record('failed', 'product_unavailable');
        throw new UserFacingError(i18n.t('errors.packUnavailable'));
      }

      const result = await adapty.makePurchase(product);
      if (result.type !== 'success') {
        const rt = result.type as string;
        record(rt === 'user_cancelled' ? 'cancelled' : 'failed', rt);
        throw new UserFacingError(i18n.t('errors.purchaseFailed'));
      }
      await downloadPack(packId, storagePath);
      applyProfile(result.profile);
      // Belt-and-suspenders: guarantee the just-bought pack is reflected even if
      // the purchase-result profile hasn't propagated the non-subscription yet.
      useEntitlementsStore.getState().addOwnedPack(packId);
    },
  );
}

// Restores purchases from the StoreKit receipt and applies them to the device
// entitlements — premium AND individual packs, for anonymous or named users
// alike. Returns true if any purchase was found. Then prefetches now-accessible
// pack files so restored content is playable offline.
export async function restorePurchases(): Promise<boolean> {
  const profile = await adapty.restorePurchases();
  applyProfile(profile);
  const { entitlements, packCatalog } = useEntitlementsStore.getState();
  const found = entitlements.isPremium || entitlements.ownedPackIds.length > 0;
  if (found) prefetchAllCatalog(packCatalog).catch(() => {});
  return found;
}
