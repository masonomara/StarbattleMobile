import { prefetchPackFile, cachePackPreview, prefetchHintsFile } from './index';
import { useEntitlementsStore } from '../stores/entitlementsStore';
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
  const packWork = catalog
    .filter(p => p.storagePath)
    .map(p => {
      if (hasPackAccess(p.id)) {
        // Hints ride the same prefetch as the pack — disk-cached for offline.
        prefetchHintsFile(p.id).catch(() => {});
        return prefetchPackFile(p.id, p.storagePath!).catch(() => {});
      }
      return cachePackPreview(p.id, p.storagePath!).catch(() => {});
    });
  await Promise.allSettled(packWork);
}
