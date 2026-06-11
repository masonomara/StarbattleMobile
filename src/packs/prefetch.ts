import { prefetchPackFile, cachePackPreview, prefetchHintsFile } from './index';
import { useEntitlementsStore } from '../shared/stores/entitlementsStore';
import { mark, time } from '../shared/lib/perfLog';
import type { PackCatalogItem } from '../types';

// ETag-aware refresh of all catalog content and streak packs.
// Each pack gets a full download if the user has access (free, premium, or
// owned); unpurchased paid packs get only their first puzzle cached as a
// preview. A failure for any individual item does not abort the others.
//
// Access check delegates to hasPackAccess in the entitlements store so the
// logic stays in one place and prefetch always uses the current entitlements.
export async function prefetchAllCatalog(catalog: PackCatalogItem[]): Promise<void> {
  const { hasPackAccess } = useEntitlementsStore.getState();
  const withPath = catalog.filter(p => p.storagePath);
  const accessCount = withPath.filter(p => hasPackAccess(p.id)).length;
  mark(
    'PREFETCH',
    `prefetchAllCatalog start — ${withPath.length} packs (${accessCount} full+hints, ${withPath.length - accessCount} preview-only), all fan out concurrently`,
  );
  const endAll = time('PREFETCH', 'prefetchAllCatalog total');
  const packWork = withPath.map(p => {
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
  endAll(`${withPath.length} packs`);
}
