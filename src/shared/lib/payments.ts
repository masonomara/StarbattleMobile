import { adapty } from 'react-native-adapty';
import type { AdaptyPaywallProduct } from 'react-native-adapty';
import { downloadPack } from '../../packs';
import { useEntitlementsStore } from '../stores/entitlementsStore';
import { prefetchAllCatalog } from '../../packs/prefetch';
import i18n from './i18n';
import { UserFacingError } from './errors';

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

export async function purchasePremium(): Promise<boolean> {
  const products = await getProducts();
  const product = products.find(p => p.vendorProductId === PREMIUM_PRODUCT_ID);
  if (!product)
    throw new UserFacingError(i18n.t('errors.productUnavailable'));

  const result = await adapty.makePurchase(product);
  if (result.type === 'success') {
    if (!(result.profile.accessLevels?.premium?.isActive ?? false)) {
      throw new UserFacingError(i18n.t('errors.purchaseLag'));
    }
    useEntitlementsStore.getState().setIsPremium(true);
    const { packCatalog } = useEntitlementsStore.getState();
    prefetchAllCatalog(packCatalog).catch(() => {});
    return true;
  }
  throw new UserFacingError(i18n.t('errors.purchaseFailed'));
}

export async function purchasePack(
  packId: string,
  storagePath: string,
): Promise<void> {
  const products = await getProducts();
  const product = products.find(
    p => p.vendorProductId === `starbattle_pack_${packId}`,
  );
  if (!product) throw new UserFacingError(i18n.t('errors.packUnavailable'));

  const result = await adapty.makePurchase(product);
  if (result.type !== 'success')
    throw new UserFacingError(i18n.t('errors.purchaseFailed'));
  await downloadPack(packId, storagePath);
  useEntitlementsStore.getState().addOwnedPack(packId);
}

// Returns true if premium access was found and activated, false otherwise.
// Pack entitlements sync automatically via PowerSync once Adapty's webhook fires.
export async function restorePurchases(): Promise<boolean> {
  const profile = await adapty.restorePurchases();
  const isPremium = profile.accessLevels?.premium?.isActive ?? false;
  if (isPremium) {
    useEntitlementsStore.getState().setIsPremium(true);
    const { packCatalog } = useEntitlementsStore.getState();
    prefetchAllCatalog(packCatalog).catch(() => {});
  }
  return isPremium;
}
