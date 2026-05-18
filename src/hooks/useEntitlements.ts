import { useEntitlementsStore } from '../stores/entitlementsStore';

export function useEntitlements() {
  return useEntitlementsStore();
}
