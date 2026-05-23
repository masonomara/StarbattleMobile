import { useShallow } from 'zustand/react/shallow';
import { useEntitlementsStore } from '../stores/entitlementsStore';

export function useEntitlements() {
  return useEntitlementsStore(
    useShallow(s => ({
      entitlements: s.entitlements,
      packCatalog: s.packCatalog,
      hasPackAccess: s.hasPackAccess,
      canPlayPuzzle: s.canPlayPuzzle,
    })),
  );
}
