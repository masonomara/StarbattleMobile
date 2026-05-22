import { create } from 'zustand';
import { db } from '../powersync/database';
import type { Entitlements, PackCatalogItem } from '../types/user';

type EntitlementsState = {
  entitlements: Entitlements;
  packCatalog: PackCatalogItem[];
  loadPackCatalog: () => Promise<void>;
  loadEntitlements: (userId: string) => Promise<void>;
  hasPackAccess: (packId: string) => boolean;
  canPlayPuzzle: (packId: string, puzzleIndex: number, completedCount: number) => boolean;
  canPlayPack: (packId: string) => boolean;
};

const DEFAULT_ENTITLEMENTS: Entitlements = {
  isPremium: false,
  ownedPackIds: [],
};

export const useEntitlementsStore = create<EntitlementsState>((set, get) => ({
  entitlements: DEFAULT_ENTITLEMENTS,
  packCatalog: [],

  loadPackCatalog: async () => {
    const catalogRows = await db.getAll<{
      id: string;
      name: string;
      grid_size: number;
      stars: number;
      difficulty: string;
      is_free: number;
      price_usd: number | null;
      puzzle_count: number;
      storage_path: string | null;
    }>('SELECT * FROM packs WHERE published = 1 ORDER BY sort_order ASC NULLS LAST');
    const packCatalog: PackCatalogItem[] = catalogRows.map(r => ({
      id: r.id,
      name: r.name,
      gridSize: r.grid_size,
      stars: r.stars,
      difficulty: r.difficulty as 'normal' | 'hard',
      isFree: r.is_free === 1,
      priceUsd: r.price_usd ?? undefined,
      puzzleCount: r.puzzle_count,
      storagePath: r.storage_path ?? undefined,
    }));
    set({ packCatalog });
  },

  loadEntitlements: async (userId: string) => {
    const [entRow] = await db.getAll<{
      is_premium: number;
      premium_purchased_at: string | null;
      owned_pack_ids: string;
    }>('SELECT * FROM user_entitlements WHERE id = ?', [userId]);

    const catalogRows = await db.getAll<{
      id: string;
      name: string;
      grid_size: number;
      stars: number;
      difficulty: string;
      is_free: number;
      price_usd: number | null;
      puzzle_count: number;
      storage_path: string | null;
    }>('SELECT * FROM packs WHERE published = 1 ORDER BY sort_order ASC NULLS LAST');

    const entitlements: Entitlements = entRow
      ? {
          isPremium: entRow.is_premium === 1,
          premiumPurchasedAt: entRow.premium_purchased_at ?? undefined,
          ownedPackIds: JSON.parse(entRow.owned_pack_ids || '[]'),
        }
      : DEFAULT_ENTITLEMENTS;

    const packCatalog: PackCatalogItem[] = catalogRows.map(r => ({
      id: r.id,
      name: r.name,
      gridSize: r.grid_size,
      stars: r.stars,
      difficulty: r.difficulty as 'normal' | 'hard',
      isFree: r.is_free === 1,
      priceUsd: r.price_usd ?? undefined,
      puzzleCount: r.puzzle_count,
      storagePath: r.storage_path ?? undefined,
    }));

    set({ entitlements, packCatalog });
  },

  hasPackAccess: (packId: string) => {
    const { entitlements, packCatalog } = get();
    if (entitlements.isPremium) return true;
    const pack = packCatalog.find(p => p.id === packId);
    if (!pack) return false;
    if (pack.isFree) return true;
    return entitlements.ownedPackIds.includes(packId);
  },

  canPlayPuzzle: (packId: string, puzzleIndex: number, completedCount: number) => {
    const { entitlements } = get();
    if (!get().hasPackAccess(packId)) return false;
    if (entitlements.isPremium) return true;
    return puzzleIndex <= completedCount;
  },

  canPlayPack: (packId: string) => {
    return get().hasPackAccess(packId);
  },
}));
