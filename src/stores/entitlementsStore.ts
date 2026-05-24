import { create } from 'zustand';
import { db } from '../powersync/AppSchema';
import type { Entitlements, PackCatalogItem } from '../types.ts';

type PackRow = {
  id: string;
  name: string;
  grid_size: number;
  stars: number;
  difficulty: string;
  is_free: number;
  price_usd: number | null;
  puzzle_count: number;
  storage_path: string | null;
};

const PACK_QUERY =
  'SELECT * FROM packs WHERE published = 1 ORDER BY sort_order ASC NULLS LAST';

function mapPackRow(r: PackRow): PackCatalogItem {
  return {
    id: r.id,
    name: r.name,
    gridSize: r.grid_size,
    stars: r.stars,
    difficulty: r.difficulty as 'normal' | 'hard',
    isFree: r.is_free === 1,
    priceUsd: r.price_usd ?? undefined,
    puzzleCount: r.puzzle_count,
    storagePath: r.storage_path ?? undefined,
  };
}

type EntitlementsState = {
  entitlements: Entitlements;
  packCatalog: PackCatalogItem[];
  loadPackCatalog: () => Promise<void>;
  loadEntitlements: (userId: string) => Promise<void>;
  hasPackAccess: (packId: string) => boolean;
  canPlayPuzzle: (packId: string, puzzleIndex: number, completedCount: number) => boolean;
};

const DEFAULT_ENTITLEMENTS: Entitlements = {
  isPremium: false,
  ownedPackIds: [],
};

export const useEntitlementsStore = create<EntitlementsState>((set, get) => ({
  entitlements: DEFAULT_ENTITLEMENTS,
  packCatalog: [],

  loadPackCatalog: async () => {
    const packCatalog = (await db.getAll<PackRow>(PACK_QUERY)).map(mapPackRow);
    set({ packCatalog });
  },

  loadEntitlements: async (userId: string) => {
    const [entRow, catalogRows] = await Promise.all([
      db.getOptional<{
        is_premium: number;
        premium_purchased_at: string | null;
        owned_pack_ids: string;
      }>('SELECT * FROM user_entitlements WHERE id = ?', [userId]),
      db.getAll<PackRow>(PACK_QUERY),
    ]);

    const entitlements: Entitlements = entRow
      ? {
          isPremium: entRow.is_premium === 1,
          premiumPurchasedAt: entRow.premium_purchased_at ?? undefined,
          ownedPackIds: JSON.parse(entRow.owned_pack_ids || '[]'),
        }
      : DEFAULT_ENTITLEMENTS;

    set({ entitlements, packCatalog: catalogRows.map(mapPackRow) });
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
    if (!get().hasPackAccess(packId)) return false;
    if (get().entitlements.isPremium) return true;
    return puzzleIndex <= completedCount;
  },
}));
