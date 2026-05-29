import { prefetchPackFile, cachePackPreview, prefetchHintsFile } from './index';
import type { PackCatalogItem, Entitlements } from '../types';

// ETag-aware refresh of all catalog content and streak packs.
// Each pack gets a full download if the user has access (free, premium, or
// owned); unpurchased paid packs get only their first puzzle cached as a
// preview. A failure for any individual item does not abort the others.
export async function prefetchAllCatalog(
  catalog: PackCatalogItem[],
  entitlements: Entitlements,
): Promise<void> {
  const packWork = catalog
    .filter(p => p.storagePath)
    .map(p => {
      const hasFullAccess =
        p.isFree ||
        entitlements.isPremium ||
        entitlements.ownedPackIds.includes(p.id);
      if (hasFullAccess) {
        prefetchHintsFile(p.id).catch(e => console.error(`[SB:HINTS] prefetchAllCatalog failed for ${p.id}:`, e));
        return prefetchPackFile(p.id, p.storagePath!).catch(() => {});
      }
      return cachePackPreview(p.id, p.storagePath!).catch(() => {});
    });
  await Promise.allSettled(packWork);
}

