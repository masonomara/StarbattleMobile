export type UserRole = 'anonymous' | 'free' | 'premium';

export type Entitlements = {
  isPremium: boolean;
  premiumPurchasedAt?: string;
  ownedPackIds: string[];
};

export type PackCatalogItem = {
  id: string;
  name: string;
  gridSize: number;
  stars: number;
  difficulty: 'normal' | 'hard';
  isFree: boolean;
  priceUsd?: number;
  puzzleCount: number;
  storagePath?: string;
};

export type PaywallContext =
  | { type: 'sequential'; packId: string; puzzleIndex: number }
  | {
      type: 'paid-pack';
      packId: string;
      packName: string;
      priceUsd: number;
      storagePath: string;
    };
