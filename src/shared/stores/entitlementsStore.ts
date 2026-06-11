import { create } from 'zustand';
import { db } from '../../powersync/AppSchema';
import { time } from '../lib/perfLog';
import type { Entitlements, PackCatalogItem } from '../../types';

// Raw row shape returned by the `packs` PowerSync table.
// Mapped to PackCatalogItem (camelCase, booleans) before reaching the UI.
type PackRow = {
  id: string;
  name: string;
  grid_size: number;
  stars: number;
  difficulty: string | null;
  is_free: number;
  price_usd: number | null;
  puzzle_count: number;
  storage_path: string | null;
  type: string | null;
};

const PACK_QUERY =
  'SELECT * FROM packs WHERE published = 1 ORDER BY sort_order ASC NULLS LAST';

// Safely parses a JSON-encoded string array from the database.
// Falls back to [] on null, empty string, or malformed JSON — the column
// is trusted data from our own backend, so silent recovery is acceptable.
function parseJsonArray(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Converts a raw DB row to the camelCase PackCatalogItem shape used by the UI.
function mapPackRow(r: PackRow): PackCatalogItem {
  return {
    id: r.id,
    name: r.name,
    gridSize: r.grid_size,
    stars: r.stars,
    difficulty: (r.difficulty ?? undefined) as 'normal' | 'hard' | undefined,
    isFree: r.is_free === 1,
    priceUsd: r.price_usd ?? undefined,
    puzzleCount: r.puzzle_count,
    storagePath: r.storage_path ?? undefined,
    // Either a StreakType (streak carousel) or a library bundle name — see PackCatalogItem.
    type: r.type ?? undefined,
  };
}

type EntitlementsState = {
  entitlements: Entitlements;
  packCatalog: PackCatalogItem[];
  loadPackCatalog: () => Promise<void>;
  loadEntitlements: (userId: string) => Promise<void>;
  setIsPremium: (val: boolean) => void;
  addOwnedPack: (packId: string) => void;
  hasPackAccess: (packId: string) => boolean;
  canPlayPuzzle: (packId: string, puzzleIndex: number, completedCount: number) => boolean;
};

// Baseline entitlements for anonymous users and users whose row hasn't synced yet.
const DEFAULT_ENTITLEMENTS: Entitlements = {
  isPremium: false,
  ownedPackIds: [],
};

export const useEntitlementsStore = create<EntitlementsState>((set, get) => ({
  entitlements: DEFAULT_ENTITLEMENTS,
  packCatalog: [],

  // Loads the published pack list from PowerSync. Called once at app startup
  // after the first sync, and again after reconnectPowerSync on account migration.
  loadPackCatalog: async () => {
    const endQuery = time('STARTUP', 'loadPackCatalog db.getAll(packs)');
    const rows = await db.getAll<PackRow>(PACK_QUERY);
    endQuery(`${rows.length} rows`);
    const packCatalog = rows.map(mapPackRow);
    set({ packCatalog });
  },

  // Loads the user's entitlement row from PowerSync. Called after sign-in
  // and after account migration to reflect the merged entitlements.
  loadEntitlements: async (userId: string) => {
    const entRow = await db.getOptional<{
      is_premium: number;
      premium_purchased_at: string | null;
      owned_pack_ids: string;
    }>('SELECT * FROM user_entitlements WHERE user_id = ?', [userId]);

    const entitlements: Entitlements = entRow
      ? {
          isPremium: entRow.is_premium === 1,
          premiumPurchasedAt: entRow.premium_purchased_at ?? undefined,
          ownedPackIds: parseJsonArray(entRow.owned_pack_ids),
        }
      : DEFAULT_ENTITLEMENTS;

    set({ entitlements });
  },

  // Called by the Adapty purchase webhook handler to flip premium status
  // immediately after a successful purchase, without waiting for a sync cycle.
  setIsPremium: (val: boolean) => {
    set(state => ({ entitlements: { ...state.entitlements, isPremium: val } }));
  },

  // Appends a pack to the owned list after an individual pack purchase.
  // No-ops if the pack is already owned (idempotent).
  addOwnedPack: (packId: string) => {
    set(state => {
      if (state.entitlements.ownedPackIds.includes(packId)) return state;
      return {
        entitlements: {
          ...state.entitlements,
          ownedPackIds: [...state.entitlements.ownedPackIds, packId],
        },
      };
    });
  },

  // Access hierarchy (highest to lowest priority):
  //   1. isPremium — unlocks everything
  //   2. ownedPackIds — individual pack purchase
  //   3. isFree — no purchase needed
  // Returns false for unknown packIds (pack not yet synced or doesn't exist).
  hasPackAccess: (packId: string) => {
    const { entitlements, packCatalog } = get();
    if (entitlements.isPremium) return true;
    const pack = packCatalog.find(p => p.id === packId);
    if (!pack) return false;
    if (pack.isFree) return true;
    return entitlements.ownedPackIds.includes(packId);
  },

  // Whether the user may play a specific puzzle within a pack.
  // Non-premium users are gated sequentially: they can only reach puzzle N
  // once puzzle N-1 is complete (puzzleIndex <= completedCount).
  // Premium users can jump to any puzzle immediately.
  // NOTE: `completedCount` is passed in by the caller (LibraryScreen) rather
  // than queried here, so canPlayPuzzle remains synchronous. The caller is
  // responsible for keeping completedCount current (it's refreshed on focus).
  // If completedCount is stale (e.g. caller forgot to refresh), this function
  // may return an incorrect result — the bug would manifest as a puzzle
  // appearing unlocked or locked incorrectly after a solve.
  canPlayPuzzle: (packId: string, puzzleIndex: number, completedCount: number) => {
    if (!get().hasPackAccess(packId)) return false;
    if (get().entitlements.isPremium) return true;
    return puzzleIndex <= completedCount;
  },
}));
