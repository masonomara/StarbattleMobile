import { adapty } from 'react-native-adapty';
import type { AdaptyPaywallProduct } from 'react-native-adapty';
import { downloadPack } from '../packs';

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

export async function purchasePremium(): Promise<boolean> {
  const products = await getProducts();
  const product = products.find(p => p.vendorProductId === 'sb_premium_599');
  if (!product) throw new Error('Premium product not found in paywall');

  const result = await adapty.makePurchase(product);
  if (result.type === 'success') {
    return result.profile.accessLevels?.premium?.isActive ?? false;
  }
  throw new Error('Purchase did not complete. Please try again.');
}

export async function purchasePack(
  packId: string,
  storagePath: string,
): Promise<void> {
  const products = await getProducts();
  const product = products.find(
    p => p.vendorProductId === `starbattle_pack_${packId}`,
  );
  if (!product) throw new Error(`Pack product not found: starbattle_pack_${packId}`);

  const result = await adapty.makePurchase(product);
  if (result.type !== 'success') throw new Error('Purchase did not complete. Please try again.');
  await downloadPack(packId, storagePath);
}

export async function restorePurchases(): Promise<void> {
  await adapty.restorePurchases();
}
