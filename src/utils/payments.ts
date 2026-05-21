import { adapty } from 'react-native-adapty';
import type { AdaptyPaywall, AdaptyPaywallProduct } from 'react-native-adapty';
import { downloadPack } from '../packs/downloaded';

export async function fetchPaywall(placementId = 'main_paywall'): Promise<{
  paywall: AdaptyPaywall;
  products: AdaptyPaywallProduct[];
}> {
  const paywall = await adapty.getPaywall(placementId);
  const products = await adapty.getPaywallProducts(paywall);
return { paywall, products };
}

export async function purchasePremium(): Promise<boolean> {
  const { products } = await fetchPaywall();
  const product = products.find(p => p.vendorProductId === 'sb_premium_599');
  if (!product) throw new Error('Premium product not found in paywall');

  const result = await adapty.makePurchase(product);
  if (result.type === 'success') {
    return result.profile.accessLevels?.premium?.isActive ?? false;
  }
  return false;
}

export async function purchasePack(packId: string): Promise<void> {
  const { products } = await fetchPaywall();
  const product = products.find(
    p => p.vendorProductId === `starbattle_pack_${packId}`,
  );
  if (!product) throw new Error(`Pack product not found: starbattle_pack_${packId}`);

  await adapty.makePurchase(product);
  await downloadPack(packId);
}

export async function restorePurchases(): Promise<void> {
  await adapty.restorePurchases();
}
