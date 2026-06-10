import { prefetchPackFile, cachePackPreview, prefetchHintsFile } from './index';
import { useEntitlementsStore } from '../shared/stores/entitlementsStore';
import type { PackCatalogItem } from '../types';

// ETag-aware refresh of all catalog content and streak packs.
// Each pack gets a full download if the user has access (free, premium, or
// owned); unpurchased paid packs get only their first puzzle cached as a
// preview. A failure for any individual item does not abort the others.
//
// Access check delegates to hasPackAccess in the entitlements store so the
// logic stays in one place and prefetch always uses the current entitlements.
export async function prefetchAllCatalog(catalog: PackCatalogItem[]): Promise<void> {
  // [SB:MEASURE] remove after profiling — brackets the whole catalog prefetch pass.
  const _mt0 = Date.now();
  console.log(`[SB:MEASURE] prefetchAllCatalog START — ${catalog.length} packs`);
  const { hasPackAccess } = useEntitlementsStore.getState();
  const packWork = catalog
    .filter(p => p.storagePath)
    .map(p => {
      if (hasPackAccess(p.id)) {
        // Hints ride the same prefetch as the pack — disk-cached for offline.
        // Awaited (not fire-and-forget) so the cycle actually completes them.
        return Promise.all([
          prefetchHintsFile(p.id).catch(() => {}),
          prefetchPackFile(p.id, p.storagePath!).catch(() => {}),
        ]).then(() => {});
      }
      return cachePackPreview(p.id, p.storagePath!).catch(() => {});
    });
  await Promise.allSettled(packWork);
  // [SB:MEASURE] remove after profiling.
  console.log(`[SB:MEASURE] prefetchAllCatalog DONE in ${Date.now() - _mt0}ms`);
}
