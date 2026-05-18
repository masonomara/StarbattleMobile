import { create } from 'zustand';
import type { Entitlements, PackCatalogItem } from '../types/user';

type EntitlementsState = {
  entitlements: Entitlements;
  packCatalog: PackCatalogItem[];
};

export const useEntitlementsStore = create<EntitlementsState>(() => ({
  entitlements: { isPremium: false, ownedPackIds: [] },
  packCatalog: [],
}));
