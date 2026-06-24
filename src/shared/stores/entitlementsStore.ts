import { create } from 'zustand';
import { db } from '../../powersync/AppSchema';
import { time } from '../lib/perfLog';
import type { Entitlements, PackCatalogItem } from '../../types';

// Raw row shape returned by the `packs` PowerSync table.
// Mapped to PackCatalogItem (camelCase, booleans) before reaching the UI.
type PackRow = {
  id: string;
  name: string;
  name_es: string | null;
  grid_size: number;
  stars: number;
  difficulty: string | null;
  is_free: number;
  price_usd: number | null;
  puzzle_count: number;
  storage_path: string | null;
  type: string | null;
  type_es: string | null;
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
    nameEs: r.name_es ?? undefined,
    gridSize: r.grid_size,
    stars: r.stars,
    difficulty: (r.difficulty ?? undefined) as 'normal' | 'hard' | undefined,
    isFree: r.is_free === 1,
    puzzleCount: r.puzzle_count,
    storagePath: r.storage_path ?? undefined,
    // Either a StreakType (streak carousel) or a library bundle name — see PackCatalogItem.
    type: r.type ?? undefined,
    typeEs: r.type_es ?? undefined,
  };
}

type EntitlementsState = {
  // Effective entitlements: the UNION of `server` and `device` (see
  // mergeEntitlements). This is what the whole app reads — never write it
  // directly, it's recomputed whenever a source changes.
  entitlements: Entitlements;
  // Cross-device entitlements synced from the user_entitlements row via
  // PowerSync. Only populated once an Adapty purchase is attributed server-side,
  // which requires a named account (the webhook keys off customer_user_id, set
  // only when we adapty.identify() a signed-in user). Empty for anonymous users.
  server: Entitlements;
  // On-device entitlements derived from the StoreKit/Adapty receipt
  // (adapty.getProfile / makePurchase / restorePurchases). Authoritative for THIS
  // device regardless of sign-in state — this is what lets an anonymous user buy
  // and keep access without registering (App Review 5.1.1(v)).
  device: Entitlements;
  packCatalog: PackCatalogItem[];
  loadPackCatalog: () => Promise<void>;
  loadEntitlements: (userId: string) => Promise<void>;
  setDeviceEntitlements: (device: Entitlements) => void;
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

// Effective access is the UNION of the server (cross-device) and device
// (this-device receipt) sources: a purchase is honored if EITHER source confirms
// it. This is the core of the App Review 5.1.1(v) fix — an anonymous on-device
// purchase lives only in `device`, so it is never lost for lack of an account,
// and registering later only ADDS the cross-device `server` source. Union is
// order-independent and idempotent, so the PowerSync load and the Adapty sync can
// land in any order without clobbering each other. Revoking access therefore
// requires BOTH sources to drop it (e.g. a refund: Adapty drops the receipt and
// the webhook clears the row) — correct for a one-time, non-account-based unlock.
function mergeEntitlements(server: Entitlements, device: Entitlements): Entitlements {
  return {
    isPremium: server.isPremium || device.isPremium,
    premiumPurchasedAt: server.premiumPurchasedAt ?? device.premiumPurchasedAt,
    ownedPackIds: Array.from(
      new Set([...server.ownedPackIds, ...device.ownedPackIds]),
    ),
  };
}

// Value-equality on effective entitlements, used to PRESERVE the `entitlements`
// object identity when a source update doesn't change the merged result. Every
// foreground re-reads the Adapty profile (usually identical), and useEntitlements
// keys on the object reference via useShallow — recomputing a fresh-but-equal
// object would re-render every consumer for nothing. Order-independent on packs.
function sameEntitlements(a: Entitlements, b: Entitlements): boolean {
  return (
    a.isPremium === b.isPremium &&
    a.premiumPurchasedAt === b.premiumPurchasedAt &&
    a.ownedPackIds.length === b.ownedPackIds.length &&
    a.ownedPackIds.every(id => b.ownedPackIds.includes(id))
  );
}

// Builds the state patch when a source slice changes: re-merge, and reuse the
// previous effective object when the merge is value-equal so consumers keyed on
// its identity don't re-render needlessly.
function reconcile(
  prevEffective: Entitlements,
  server: Entitlements,
  device: Entitlements,
): { server: Entitlements; device: Entitlements; entitlements: Entitlements } {
  const merged = mergeEntitlements(server, device);
  return {
    server,
    device,
    entitlements: sameEntitlements(prevEffective, merged) ? prevEffective : merged,
  };
}

export const useEntitlementsStore = create<EntitlementsState>((set, get) => ({
  entitlements: DEFAULT_ENTITLEMENTS,
  server: DEFAULT_ENTITLEMENTS,
  device: DEFAULT_ENTITLEMENTS,
  packCatalog: [],

  // Loads the published pack list from PowerSync. Called once at app startup
  // after the first sync, and again after reconnectPowerSync on account migration.
  loadPackCatalog: async () => {
    const endQuery = time('STARTUP', 'loadPackCatalog db.getAll(packs)');
    const rows = await db.getAll<PackRow>(PACK_QUERY);
    endQuery(`${rows.length} rows`);
    const packCatalog = rows.map(mapPackRow);
    if (__DEV__) {
      // Confirms the _es columns actually synced to the device. If these are all
      // null, the client schema (AppSchema) or the PowerSync sync rules are
      // missing name_es/type_es, or the device hasn't re-synced since they were
      // added — not a display bug.
      const withEs = packCatalog.filter(p => p.nameEs).length;
      console.log(
        `[SB:packs] ${packCatalog.length} packs, ${withEs} have name_es; sample=`,
        packCatalog[0] && {
          name: packCatalog[0].name,
          nameEs: packCatalog[0].nameEs,
          type: packCatalog[0].type,
          typeEs: packCatalog[0].typeEs,
        },
      );
    }
    set({ packCatalog });
  },

  // Loads the user's entitlement row from PowerSync into the `server` source.
  // Called after sign-in and account migration to reflect the merged
  // cross-device entitlements. Anonymous users have no row, so this resets the
  // server source to empty — the device source still carries their on-device
  // purchases, so effective access is preserved.
  loadEntitlements: async (userId: string) => {
    const entRow = await db.getOptional<{
      is_premium: number;
      premium_purchased_at: string | null;
      owned_pack_ids: string;
    }>('SELECT * FROM user_entitlements WHERE user_id = ?', [userId]);

    const server: Entitlements = entRow
      ? {
          isPremium: entRow.is_premium === 1,
          premiumPurchasedAt: entRow.premium_purchased_at ?? undefined,
          ownedPackIds: parseJsonArray(entRow.owned_pack_ids),
        }
      : DEFAULT_ENTITLEMENTS;

    set(state => reconcile(state.entitlements, server, state.device));
  },

  // Replaces the device source with a fresh snapshot derived from the Adapty
  // profile (the StoreKit receipt). Called on startup, foreground, and after
  // every purchase/restore so an on-device purchase is honored without an
  // account. See syncEntitlementsFromAdapty in payments.ts.
  setDeviceEntitlements: (device: Entitlements) => {
    set(state => reconcile(state.entitlements, state.server, device));
  },

  // Optimistically flips device premium immediately after a successful purchase,
  // without waiting for a full profile read. Reconciled by the next
  // setDeviceEntitlements (which reads the authoritative Adapty profile).
  setIsPremium: (val: boolean) => {
    set(state =>
      reconcile(state.entitlements, state.server, {
        ...state.device,
        isPremium: val,
      }),
    );
  },

  // Optimistically appends a pack to the device owned list after an individual
  // pack purchase. No-ops if already present (idempotent).
  addOwnedPack: (packId: string) => {
    set(state => {
      if (state.device.ownedPackIds.includes(packId)) return state;
      return reconcile(state.entitlements, state.server, {
        ...state.device,
        ownedPackIds: [...state.device.ownedPackIds, packId],
      });
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
