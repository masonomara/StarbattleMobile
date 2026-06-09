import { useShallow } from 'zustand/react/shallow';
import { useEntitlementsStore } from '../stores/entitlementsStore';

// useShallow prevents a re-render every time the store reference changes.
// Without it, the selector returns a new object on each call, making React
// think the value changed even when the underlying fields are identical.
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
