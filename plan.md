# Star Battle — Alpha Build Plan

**Date:** 2026-05-17  
**Branch:** alpha/init  
**Reference:** goal.md, research.md, review.md

This document is the implementation blueprint for the alpha rebuild. It is grounded in the existing beta codebase and the technology research in research.md. Every section references actual file paths and includes concrete code snippets.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        iOS Device                            │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │ Bundled JSON │   │  Local SQLite│   │   MMKV Store   │  │
│  │ (9 free libs)│   │ (PowerSync)  │   │ (settings,     │  │
│  └──────────────┘   │  progress,   │   │  auth tokens)  │  │
│  ┌──────────────┐   │  entitlemnts,│   └────────────────┘  │
│  │  Downloaded  │   │  packs meta) │                        │
│  │  Pack JSON   │   └──────┬───────┘                        │
│  │ (Supabase    │          │ PowerSync                      │
│  │  Storage)    │          │ sync stream                    │
│  └──────────────┘          │                                │
└───────────────────────────┼─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                    Supabase (Postgres)                        │
│                                                             │
│  auth.users  packs  puzzle_progress  streaks                │
│  user_entitlements  adapty_events                           │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Supabase     │  │  PowerSync   │  │  Adapty Webhooks │  │
│  │ Auth         │  │  Sync Engine │  │  Edge Function   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Data flow for puzzle progress:**

1. User taps a cell → local SQLite write (instant, offline-safe)
2. PowerSync queues the write
3. When online → PowerSync calls `uploadData` → Supabase upsert
4. Postgres row updated → PowerSync streams the change back as confirmation

**Offline guarantee:** All reads are against local SQLite. The app is fully playable without network. Writes queue and flush when connectivity returns.

**Free pack distribution:** All 9 free pack JSON files are hosted in Supabase Storage as the source of truth. On startup, the app checks for newer versions and auto-downloads any updates in the background. The bundled JSON files (committed to the repo) are the offline fallback — if the download hasn't happened yet or the user is offline, the bundled version is used. Paid pack JSON files exist only in Supabase Storage and are downloaded after purchase.

---

## User Roles and Entitlement Logic

| Capability                     | Anonymous                                                      | Free (account)       | Premium            |
| ------------------------------ | -------------------------------------------------------------- | -------------------- | ------------------ |
| Play free packs                | Yes (sequential)                                               | Yes (sequential)     | Yes (all unlocked) |
| Progress syncs across devices  | No (local only per device, but anonymous ID is tied to device) | Yes                  | Yes                |
| Purchase packs                 | No (must create account)                                       | Yes ($1.99/pack)     | N/A (included)     |
| Purchase premium               | No (must create account)                                       | Yes ($5.99 one-time) | N/A                |
| Owned packs (any order)        | No                                                             | Yes                  | N/A (all included) |
| Daily/Weekly/Monthly (current) | Yes                                                            | Yes                  | Yes                |
| Past streak puzzles            | No                                                             | No                   | Yes                |
| Future paid packs              | No                                                             | Purchase per pack    | Automatic          |

---

## Phase 0: Foundation

### 0.1 Package Installation

Remove old packages and install the new stack:

```bash
# Remove
npm uninstall react-native-svg react-native-haptic-feedback

# Install rendering + gesture + animation
npm install @shopify/react-native-skia
npm install react-native-gesture-handler@^3
npm install react-native-reanimated@^4
npm install react-native-nitro-haptics react-native-nitro-modules

# Install backend + sync
npm install @supabase/supabase-js
npm install @powersync/react-native @powersync/op-sqlite

# Install auth
npm install @invertase/react-native-apple-authentication
npm install @react-native-google-signin/google-signin

# Install payments
npm install react-native-adapty

# Keep
# react-native-mmkv (already v4 Nitro)
# zustand (already v5)
# react-native-safe-area-context
# react-native-screens
# @react-navigation/native
# @react-navigation/native-stack
# lucide-react-native

cd ios && pod install
```

### 0.2 Project Structure

The alpha src/ structure:

```
src/
├── navigation.tsx            # Typed static API navigator
├── store.ts                  # Puzzle game session (keep, minor changes)
│
├── stores/
│   ├── settingsStore.ts      # User settings (MMKV only)
│   ├── authStore.ts          # NEW: Supabase auth session
│   └── entitlementsStore.ts  # NEW: isPremium, ownedPackIds, unlock logic
│
├── powersync/
│   ├── AppSchema.ts          # NEW: client SQLite schema
│   ├── database.ts           # NEW: PowerSync db singleton
│   └── Connector.ts          # NEW: Supabase connector
│
├── supabase/
│   └── client.ts             # NEW: Supabase JS client
│
├── screens/
│   ├── HomeScreen.tsx        # Redesigned
│   ├── LibraryScreen.tsx     # Renamed from PackScreen
│   ├── PuzzleScreen.tsx      # Updated (Skia canvas)
│   ├── StreaksScreen.tsx      # NEW
│   └── AccountScreen.tsx     # NEW
│
├── components/
│   ├── PuzzleCanvas.tsx      # NEW: Skia canvas (replaces BoardView + SVG)
│   ├── Toolbar.tsx           # Keep, minor updates
│   ├── WinBanner.tsx         # Keep
│   ├── Header.tsx            # Keep
│   ├── HeaderTimer.tsx       # Keep
│   ├── PaywallModal.tsx      # NEW
│   └── SettingsModal.tsx     # Updated (moved to AccountScreen)
│
├── hooks/
│   ├── useTheme.ts           # Keep
│   ├── useZoom.ts            # Keep (GH v3 syntax update)
│   ├── useDrawGesture.ts     # Keep (GH v3 syntax update)
│   └── useEntitlements.ts    # NEW: unlock check helpers
│
├── utils/
│   ├── puzzleLogic.ts        # Keep as-is
│   ├── parsePuzzle.ts        # Keep, add validation
│   ├── streakDate.ts         # Keep as-is
│   ├── persistProgress.ts    # REPLACED by PowerSync writes
│   ├── formatTime.ts         # Keep
│   └── haptics.ts            # Updated for Nitro
│
├── packs/
│   ├── index.ts              # Bundled pack loader
│   └── downloaded.ts         # NEW: downloaded paid pack loader
│
├── storage.ts                # Keep for settings; remove progress/streaks keys
│
└── types/
    ├── puzzle.ts             # Keep (Coord, HintStep, RawPuzzle, Puzzle, Pack)
    ├── state.ts              # Update (remove ProgressState, add new types)
    └── user.ts               # NEW: UserRole, Entitlements
```

### 0.3 Type System Updates

Keep existing types in `src/types/puzzle.ts` entirely — `RawPuzzle`, `Puzzle`, `Pack`, `Coord`, `HintStep` are correct.

Update `src/types/state.ts` — remove `ProgressState` and `UserState` (those become separate stores), keep the rest:

```typescript
// src/types/state.ts
export type StreakType = 'daily' | 'weekly' | 'monthly';

export type Streak = {
  type: StreakType;
  current: number;
  lastCompletedKey: string;
};

export type CellValue = 0 | 1 | 2; // 0=empty, 1=star, 2=marked

export type TapMode = 'cycle' | 'erase';

export type Progress = {
  puzzleId: string;
  cells: CellValue[];
  autoMarks?: number[];
  timeMs: number;
  completed: boolean;
  completedAt?: number;
  updatedAt: number;
};

export type UserSettings = {
  autoXNeighbors: boolean;
  autoXRowsCols: boolean;
  autoXRegions: boolean;
  highlightErrors: boolean;
  showTimer: boolean;
  hideToolbar: boolean;
  theme: 'system' | 'light' | 'dark';
  haptics: boolean;
};

export type CellChange = {
  index: number;
  prev: CellValue;
  next: CellValue;
};

export type Move = {
  changes: CellChange[];
  autoMarks: number[];
};
```

Add `src/types/user.ts`:

```typescript
// src/types/user.ts
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
  storagePath?: string; // Supabase Storage path for paid packs
};
```

---

## Phase 1: Supabase Schema

Run in the Supabase SQL editor. One migration file.

```sql
-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Pack catalog (admin-managed)
create table packs (
  id          text primary key,
  name        text not null,
  grid_size   integer not null,
  stars       integer not null,
  difficulty  text not null check (difficulty in ('normal', 'hard')),
  is_free     boolean not null default false,
  price_usd   numeric(6,2),
  puzzle_count integer not null,
  storage_path text,             -- Supabase Storage path for paid pack JSON
  published   boolean not null default false,
  created_at  timestamptz default now()
);

-- Per-user per-puzzle progress
create table puzzle_progress (
  id           text primary key default gen_random_uuid()::text,
  user_id      uuid not null references auth.users(id) on delete cascade,
  puzzle_id    text not null,  -- e.g. "5x5-normal:42" or "daily:2026-05-17"
  cells        text not null,  -- JSON: CellValue[]
  auto_marks   text,           -- JSON: number[]
  time_ms      integer not null default 0,
  completed    boolean not null default false,
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  unique(user_id, puzzle_id)
);
create index puzzle_progress_user_id_idx on puzzle_progress(user_id);

-- Per-user streak tracking
create table streaks (
  id                  text primary key default gen_random_uuid()::text,
  user_id             uuid not null references auth.users(id) on delete cascade,
  type                text not null check (type in ('daily', 'weekly', 'monthly')),
  current_count       integer not null default 0,
  last_completed_key  text not null default '',
  updated_at          timestamptz not null default now(),
  unique(user_id, type)
);

-- Entitlements: premium status + owned paid packs
create table user_entitlements (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  is_premium           boolean not null default false,
  premium_purchased_at timestamptz,
  owned_pack_ids       text[] not null default '{}',
  updated_at           timestamptz not null default now()
);

-- Adapty event audit log
create table adapty_events (
  id                text primary key default gen_random_uuid()::text,
  profile_id        text,
  customer_user_id  text,
  event_type        text not null,
  event_properties  jsonb,
  received_at       timestamptz not null default now()
);

-- Streak archive: maps each calendar period to a specific puzzle index
-- Populated by an admin script that assigns puzzles to dates before they go live
-- Only rows whose date_key is <= today appear in the archive UI
create table streak_archive (
  id          text primary key default gen_random_uuid()::text,
  type        text not null check (type in ('daily', 'weekly', 'monthly')),
  date_key    text not null,  -- e.g. "2026-05-18" (daily), "2026-W20" (weekly), "2026-05" (monthly)
  puzzle_id   text not null,  -- references packs puzzle by index, e.g. "daily:42"
  created_at  timestamptz not null default now(),
  unique(type, date_key)
);

-- Public read — the archive is the same for all users
alter table streak_archive enable row level security;
create policy "streak archive is public"
  on streak_archive for select using (true);

-- Row-level security
alter table puzzle_progress enable row level security;
alter table streaks enable row level security;
alter table user_entitlements enable row level security;

create policy "users own their progress"
  on puzzle_progress for all using (auth.uid() = user_id);

create policy "users own their streaks"
  on streaks for all using (auth.uid() = user_id);

create policy "users own their entitlements"
  on user_entitlements for select using (auth.uid() = user_id);

-- Only the Edge Function (service role) can write entitlements
create policy "service role writes entitlements"
  on user_entitlements for all using (auth.role() = 'service_role');

-- Packs are public read
alter table packs enable row level security;
create policy "packs are public"
  on packs for select using (published = true);

-- Seed initial free pack metadata (IDs match bundled JSON ids)
insert into packs (id, name, grid_size, stars, difficulty, is_free, puzzle_count, published) values
  ('5x5-normal',   '5×5 / 1★ Normal',   5,  1, 'normal', true, 60, true),
  ('6x6-normal',   '6×6 / 1★ Normal',   6,  1, 'normal', true, 60, true),
  ('6x6-hard',     '6×6 / 1★ Hard',     6,  1, 'hard',   true, 60, true),
  ('8x8-normal',   '8×8 / 1★ Normal',   8,  1, 'normal', true, 60, true),
  ('8x8-hard',     '8×8 / 1★ Hard',     8,  1, 'hard',   true, 60, true),
  ('10x10-normal', '10×10 / 2★ Normal', 10, 2, 'normal', true, 60, true),
  ('10x10-hard',   '10×10 / 2★ Hard',   10, 2, 'hard',   true, 60, true),
  ('14x14-normal', '14×14 / 3★ Normal', 14, 3, 'normal', true, 60, true),
  ('14x14-hard',   '14×14 / 3★ Hard',   14, 3, 'hard',   true, 60, true);
```

**On account creation:** create a trigger to initialize entitlements and streaks:

```sql
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into user_entitlements (user_id) values (new.id) on conflict do nothing;
  insert into streaks (user_id, type)
    values (new.id, 'daily'), (new.id, 'weekly'), (new.id, 'monthly')
    on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
```

---

## Phase 2: PowerSync Setup

### 2.1 Sync Rules

Deploy `sync-rules.yaml` to your PowerSync instance (via the PowerSync dashboard or CLI):

```yaml
# sync-rules.yaml
bucket_definitions:
  # Pack catalog + streak archive: same for every user, syncs globally
  global_packs:
    data:
      - SELECT id, name, grid_size, stars, difficulty, is_free,
        price_usd, puzzle_count, storage_path, published
        FROM packs
        WHERE published = true
      - SELECT id, type, date_key, puzzle_id FROM streak_archive

  # All user-specific data in one bucket keyed by user_id
  user_data:
    priority: 1 # loads before global_packs on first sync
    parameters: SELECT request.user_id() AS user_id
    data:
      - SELECT * FROM puzzle_progress WHERE user_id = bucket.user_id
      - SELECT * FROM streaks         WHERE user_id = bucket.user_id
      - SELECT user_id AS id, is_premium, premium_purchased_at, owned_pack_ids, updated_at
        FROM user_entitlements WHERE user_id = bucket.user_id
```

### 2.2 Client SQLite Schema

```typescript
// src/powersync/AppSchema.ts
import { column, Schema, Table } from '@powersync/react-native';

const packs = new Table({
  name: column.text,
  grid_size: column.integer,
  stars: column.integer,
  difficulty: column.text,
  is_free: column.integer,
  price_usd: column.real,
  puzzle_count: column.integer,
  storage_path: column.text,
  published: column.integer,
});

const puzzle_progress = new Table(
  {
    user_id: column.text,
    puzzle_id: column.text,
    cells: column.text,
    auto_marks: column.text,
    time_ms: column.integer,
    completed: column.integer,
    completed_at: column.text,
    updated_at: column.text,
  },
  { indexes: { by_puzzle: ['user_id', 'puzzle_id'] } },
);

const streaks = new Table(
  {
    user_id: column.text,
    type: column.text,
    current_count: column.integer,
    last_completed_key: column.text,
    updated_at: column.text,
  },
  { indexes: { by_user_type: ['user_id', 'type'] } },
);

const user_entitlements = new Table({
  is_premium: column.integer,
  premium_purchased_at: column.text,
  owned_pack_ids: column.text, // JSON string: string[]
  updated_at: column.text,
});

const streak_archive = new Table(
  {
    type: column.text,
    date_key: column.text,
    puzzle_id: column.text,
  },
  { indexes: { by_type_date: ['type', 'date_key'] } },
);

export const AppSchema = new Schema({
  packs,
  puzzle_progress,
  streaks,
  user_entitlements,
  streak_archive,
});
export type Database = (typeof AppSchema)['types'];
```

### 2.3 Database Singleton

```typescript
// src/powersync/database.ts
import { PowerSyncDatabase } from '@powersync/react-native';
import { OPSqliteOpenFactory } from '@powersync/op-sqlite';
import { AppSchema } from './AppSchema';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: new OPSqliteOpenFactory({ dbFilename: 'starbattle.db' }),
});
```

### 2.4 Supabase Connector

```typescript
// src/powersync/Connector.ts
import {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
  UpdateType,
} from '@powersync/react-native';
import { supabase } from '../supabase/client';

export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials(): Promise<PowerSyncCredentials> {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error || !session) throw new Error('No active session');
    return {
      endpoint: process.env.POWERSYNC_URL!,
      token: session.access_token,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;
    try {
      for (const op of transaction.crud) {
        const record = { ...op.opData, id: op.id };
        switch (op.op) {
          case UpdateType.PUT:
            await supabase.from(op.table).upsert(record);
            break;
          case UpdateType.PATCH:
            await supabase.from(op.table).update(op.opData!).eq('id', op.id);
            break;
          case UpdateType.DELETE:
            await supabase.from(op.table).delete().eq('id', op.id);
            break;
        }
      }
      await transaction.complete();
    } catch (e) {
      throw e; // PowerSync retries with exponential backoff
    }
  }
}
```

### 2.5 Supabase Client

> **Config approach:** This project uses `src/config.ts` (exported constants) for
> all credentials and URLs. `process.env` is NOT used — React Native has no
> runtime env mechanism without a babel plugin. All `process.env.X!` references
> in this plan should be read as named imports from `'../config'` (or `'./src/config'`
> from the root). The actual source files already reflect this.

```typescript
// src/supabase/client.ts
import { createClient } from '@supabase/supabase-js';
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'supabase-auth' });

// MMKV adapter for Supabase auth token storage
const mmkvStorage = {
  getItem: (key: string) => mmkv.getString(key) ?? null,
  setItem: (key: string, value: string) => mmkv.set(key, value),
  removeItem: (key: string) => mmkv.delete(key),
};

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: mmkvStorage,
      autoRefreshToken: true,
      persistSession: true,
    },
  },
);
```

### 2.6 App Startup

```typescript
// App.tsx
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigation } from './src/navigation';
import { useAuthStore } from './src/stores/authStore';
import { useSettingsStore } from './src/stores/settingsStore';
import { db } from './src/powersync/database';
import { SupabaseConnector } from './src/powersync/Connector';
import { adapty } from 'react-native-adapty';

export default function App() {
  useEffect(() => {
    // 1. Initialize Adapty
    adapty.activate(process.env.ADAPTY_SDK_KEY!);

    // 2. Initialize settings from MMKV
    useSettingsStore.getState().initialize();

    // 3. Initialize auth (creates anonymous session if no session exists)
    useAuthStore
      .getState()
      .initialize()
      .then(() => {
        // 4. Connect PowerSync (needs auth session for the JWT)
        db.connect(new SupabaseConnector(), { crudUploadThrottleMs: 500 });
      });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Navigation />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

---

## Phase 3: Auth Store

Anonymous-first: every app launch creates or restores a Supabase session. No sign-up required to play.

```typescript
// src/stores/authStore.ts
import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';
import { adapty } from 'react-native-adapty';

type AuthState = {
  session: Session | null;
  user: User | null;
  isAnonymous: boolean;
  initialize: () => Promise<void>;
  signInAnonymously: () => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  isAnonymous: true,

  initialize: async () => {
    // Restore existing session from MMKV
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      const isAnonymous = session.user.is_anonymous ?? true;
      set({ session, user: session.user, isAnonymous });
      // Identify the user in Adapty (links purchases to this user)
      if (!isAnonymous) {
        await adapty.identify(session.user.id);
      }
    } else {
      // No existing session — create anonymous session
      await get().signInAnonymously();
    }

    // Listen for auth state changes (e.g., after account upgrade)
    supabase.auth.onAuthStateChange(async (event, session) => {
      const isAnonymous = session?.user?.is_anonymous ?? true;
      set({ session, user: session?.user ?? null, isAnonymous });
      if (session && !isAnonymous) {
        await adapty.identify(session.user.id);
      }
      if (event === 'SIGNED_OUT') {
        await adapty.logout();
      }
    });
  },

  signInAnonymously: async () => {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    set({ session: data.session, user: data.user, isAnonymous: true });
  },

  signUpWithEmail: async (email: string, password: string) => {
    // Upgrades anonymous session to a permanent account.
    // Supabase preserves all data owned by the anonymous user_id.
    const { data, error } = await supabase.auth.updateUser({ email, password });
    if (error) throw error;
    set({ session: data?.session ?? get().session, isAnonymous: false });
    if (data?.user) await adapty.identify(data.user.id);
  },

  signInWithApple: async () => {
    const { appleAuth } = await import(
      '@invertase/react-native-apple-authentication'
    );
    const credential = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
    });
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken!,
    });
    if (error) throw error;
    set({ session: data.session, user: data.user, isAnonymous: false });
    if (data.user) await adapty.identify(data.user.id);
  },

  signOut: async () => {
    await supabase.auth.signOut();
    await adapty.logout();
    set({ session: null, user: null, isAnonymous: true });
    // Re-create anonymous session so user can keep playing
    await get().signInAnonymously();
  },
}));
```

---

## Phase 4: Entitlements Store

Reads from local SQLite (PowerSync-synced) — works fully offline once synced.

```typescript
// src/stores/entitlementsStore.ts
import { create } from 'zustand';
import { db } from '../powersync/database';
import type { PackCatalogItem, Entitlements } from '../types/user';

type EntitlementsState = {
  entitlements: Entitlements;
  packCatalog: PackCatalogItem[]; // all packs from Supabase (for UI display)
  loadEntitlements: (userId: string) => Promise<void>;
  canPlayPack: (packId: string) => boolean;
  canPlayPuzzle: (
    packId: string,
    puzzleIndex: number,
    completedCount: number,
  ) => boolean;
  hasPackAccess: (packId: string) => boolean;
};

const DEFAULT_ENTITLEMENTS: Entitlements = {
  isPremium: false,
  ownedPackIds: [],
};

export const useEntitlementsStore = create<EntitlementsState>((set, get) => ({
  entitlements: DEFAULT_ENTITLEMENTS,
  packCatalog: [],

  loadEntitlements: async (userId: string) => {
    // Read from local SQLite — instant, no network
    const [entRow] = await db.getAll<{
      is_premium: number;
      premium_purchased_at: string | null;
      owned_pack_ids: string;
    }>('SELECT * FROM user_entitlements WHERE id = ?', [userId]);

    const [catalogRows] = await [
      db.getAll<{
        id: string;
        name: string;
        grid_size: number;
        stars: number;
        difficulty: string;
        is_free: number;
        price_usd: number | null;
        puzzle_count: number;
        storage_path: string | null;
      }>(
        'SELECT * FROM packs WHERE published = 1 ORDER BY is_free DESC, grid_size ASC',
      ),
    ];

    const entitlements: Entitlements = entRow
      ? {
          isPremium: entRow.is_premium === 1,
          premiumPurchasedAt: entRow.premium_purchased_at ?? undefined,
          ownedPackIds: JSON.parse(entRow.owned_pack_ids || '[]'),
        }
      : DEFAULT_ENTITLEMENTS;

    const packCatalog: PackCatalogItem[] = (catalogRows ?? []).map(r => ({
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

  // Can the user access this pack at all?
  hasPackAccess: (packId: string) => {
    const { entitlements, packCatalog } = get();
    if (entitlements.isPremium) return true;
    const pack = packCatalog.find(p => p.id === packId);
    if (!pack) return false;
    if (pack.isFree) return true;
    return entitlements.ownedPackIds.includes(packId);
  },

  // Can the user access a specific puzzle within a pack?
  // completedCount = how many puzzles in this pack the user has completed
  canPlayPuzzle: (
    packId: string,
    puzzleIndex: number,
    completedCount: number,
  ) => {
    const { entitlements } = get();
    if (!get().hasPackAccess(packId)) return false;
    if (entitlements.isPremium) return true;
    // Free/owned pack: sequential unlock
    return puzzleIndex <= completedCount;
  },

  // Can the user start a new game in this pack?
  canPlayPack: (packId: string) => {
    return get().hasPackAccess(packId);
  },
}));
```

### Reacting to PowerSync sync events

The entitlements store needs to reload when PowerSync streams a new `user_entitlements` row. Wire this up after connecting:

```typescript
// In App.tsx, after db.connect(...)
import { useEntitlementsStore } from './src/stores/entitlementsStore';
import { useAuthStore } from './src/stores/authStore';

// Watch for sync changes to entitlements table
db.watch('SELECT * FROM user_entitlements LIMIT 1', {
  onResult: () => {
    const userId = useAuthStore.getState().user?.id;
    if (userId) useEntitlementsStore.getState().loadEntitlements(userId);
  },
});
```

---

## Phase 5: Settings Store

Lightweight MMKV store. Extract from the old `userStore.ts`.

```typescript
// src/stores/settingsStore.ts
import { create } from 'zustand';
import { getSettings, saveSettings } from '../storage';
import type { UserSettings } from '../types/state';
import { usePuzzleStore } from '../store';

type SettingsState = {
  settings: UserSettings;
  initialize: () => void;
  updateSettings: (update: Partial<UserSettings>) => void;
};

export const useSettingsStore = create<SettingsState>(set => ({
  settings: getSettings(),

  initialize: () => {
    set({ settings: getSettings() });
  },

  updateSettings: update => {
    saveSettings(update);
    set(state => {
      const next = { ...state.settings, ...update };
      // If autoX settings changed, recompute marks on active puzzle
      const autoXChanged =
        'autoXNeighbors' in update ||
        'autoXRowsCols' in update ||
        'autoXRegions' in update;
      if (autoXChanged) {
        usePuzzleStore.getState().recomputeAutoMarks();
      }
      return { settings: next };
    });
  },
}));
```

Update `src/storage.ts` — remove streaks and progress functions (those move to PowerSync), keep settings:

```typescript
// src/storage.ts — alpha version
import { createMMKV } from 'react-native-mmkv';
import type { UserSettings } from './types/state';

const storage = createMMKV({ id: 'starbattle-settings' });
const SETTINGS_KEY = 'settings';

const DEFAULT_SETTINGS: UserSettings = {
  autoXNeighbors: true,
  autoXRowsCols: false,
  autoXRegions: false,
  highlightErrors: true,
  showTimer: true,
  hideToolbar: false,
  theme: 'system',
  haptics: true,
};

export function getSettings(): UserSettings {
  const json = storage.getString(SETTINGS_KEY);
  if (!json) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...JSON.parse(json) };
}

export function saveSettings(update: Partial<UserSettings>): void {
  const current = getSettings();
  storage.set(SETTINGS_KEY, JSON.stringify({ ...current, ...update }));
}
```

---

## Phase 6: Progress via PowerSync

Replace `persistProgress.ts` with PowerSync writes. All progress reads/writes go through the local SQLite db.

```typescript
// src/utils/progress.ts
import { db } from '../powersync/database';
import { useAuthStore } from '../stores/authStore';
import type { CellValue } from '../types/state';

function rowId(userId: string, puzzleId: string): string {
  // Deterministic ID so upserts work: hash of userId + puzzleId
  return `${userId}:${puzzleId}`;
}

export async function saveProgress(
  puzzleId: string,
  cells: CellValue[],
  autoMarks: Set<number>,
  timeMs: number,
  completed: boolean,
): Promise<void> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return;

  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO puzzle_progress
       (id, user_id, puzzle_id, cells, auto_marks, time_ms, completed, completed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, puzzle_id) DO UPDATE SET
       cells = excluded.cells,
       auto_marks = excluded.auto_marks,
       time_ms = excluded.time_ms,
       completed = excluded.completed,
       completed_at = COALESCE(puzzle_progress.completed_at, excluded.completed_at),
       updated_at = excluded.updated_at`,
    [
      rowId(userId, puzzleId),
      userId,
      puzzleId,
      JSON.stringify(cells),
      JSON.stringify([...autoMarks]),
      timeMs,
      completed ? 1 : 0,
      completed ? now : null,
      now,
    ],
  );
}

export async function loadProgress(puzzleId: string): Promise<{
  cells: CellValue[];
  autoMarks: number[];
  timeMs: number;
  completed: boolean;
} | null> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return null;

  const rows = await db.getAll<{
    cells: string;
    auto_marks: string | null;
    time_ms: number;
    completed: number;
  }>(
    'SELECT cells, auto_marks, time_ms, completed FROM puzzle_progress WHERE user_id = ? AND puzzle_id = ?',
    [userId, puzzleId],
  );

  if (!rows.length) return null;
  const row = rows[0];
  return {
    cells: JSON.parse(row.cells),
    autoMarks: JSON.parse(row.auto_marks ?? '[]'),
    timeMs: row.time_ms,
    completed: row.completed === 1,
  };
}

export async function getCompletedCountForPack(
  packId: string,
  puzzleCount: number,
): Promise<number> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return 0;

  // Build all puzzle IDs for this pack
  const ids = Array.from({ length: puzzleCount }, (_, i) => `${packId}:${i}`);
  const placeholders = ids.map(() => '?').join(',');

  const rows = await db.getAll<{ count: number }>(
    `SELECT COUNT(*) as count FROM puzzle_progress
     WHERE user_id = ? AND puzzle_id IN (${placeholders}) AND completed = 1`,
    [userId, ...ids],
  );
  return rows[0]?.count ?? 0;
}

export async function saveStreak(
  type: string,
  currentCount: number,
  lastCompletedKey: string,
): Promise<void> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return;

  await db.execute(
    `INSERT INTO streaks (id, user_id, type, current_count, last_completed_key, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, type) DO UPDATE SET
       current_count = excluded.current_count,
       last_completed_key = excluded.last_completed_key,
       updated_at = excluded.updated_at`,
    [
      `${userId}:${type}`,
      userId,
      type,
      currentCount,
      lastCompletedKey,
      new Date().toISOString(),
    ],
  );
}

export async function loadStreaks(): Promise<
  {
    type: string;
    currentCount: number;
    lastCompletedKey: string;
  }[]
> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return [];

  return db.getAll(
    'SELECT type, current_count as currentCount, last_completed_key as lastCompletedKey FROM streaks WHERE user_id = ?',
    [userId],
  );
}
```

### Updating `usePuzzleStore` for PowerSync

The store's `loadPuzzle` and persistence calls change to use the new async progress functions. The game logic itself (`tapCell`, `undo`, `redo`, etc.) is **unchanged** — only the I/O layer changes:

```typescript
// src/store.ts — changes from beta
// Replace: import { getProgress } from './storage';
// Replace: import { persistProgress } from './utils/persistProgress';
// With:
import { loadProgress, saveProgress } from './utils/progress';

// loadPuzzle becomes async:
loadPuzzle: async (puzzle: Puzzle) => {
  const total = puzzle.size * puzzle.size;
  const saved = await loadProgress(puzzle.id);
  set({
    puzzle,
    cells: saved ? saved.cells : new Array<CellValue>(total).fill(0),
    autoMarks: new Set(saved?.autoMarks ?? []),
    errorCells: new Set<number>(),
    completed: saved?.completed ?? false,
    timeMs: saved?.timeMs ?? 0,
    moveLog: [],
    redoStack: [],
    hintGhosts: new Map(),
    hintStepIndex: -1,
  });
},

// Replace all persistProgress() calls with:
const s = get();
saveProgress(s.puzzle!.id, s.cells, s.autoMarks, s.timeMs, s.completed);
// (fire-and-forget — no await needed in tap handler)
```

---

## Phase 7: Payments (Adapty)

### 7.1 Adapty Dashboard Setup

In the Adapty dashboard:

- Create **Product**: `starbattle_premium` (one-time $5.99, App Store + Play Store)
- Create **Product** per paid pack: `starbattle_pack_{id}` (one-time $1.99 each)
- Create **Access Level**: `premium`
- Create **Paywall**: `main_paywall` with both products

### 7.2 Purchase Flow

```typescript
// src/utils/payments.ts
import { adapty } from 'react-native-adapty';
import { useAuthStore } from '../stores/authStore';

export async function fetchPaywall(placementId = 'main_paywall') {
  const placement = await adapty.getPaywall(placementId);
  const products = await adapty.getPaywallProducts(placement);
  return { placement, products };
}

export async function purchasePremium(): Promise<boolean> {
  const { products } = await fetchPaywall();
  const premiumProduct = products.find(
    p => p.vendorProductId === 'starbattle_premium',
  );
  if (!premiumProduct) throw new Error('Premium product not found');

  const result = await adapty.makePurchase(premiumProduct);
  // Entitlement update comes via webhook → Supabase → PowerSync → local SQLite
  // The UI will update automatically when PowerSync streams the entitlements change
  return result.accessLevels?.['premium']?.isActive ?? false;
}

export async function purchasePack(packId: string): Promise<boolean> {
  const { products } = await fetchPaywall();
  const packProduct = products.find(
    p => p.vendorProductId === `starbattle_pack_${packId}`,
  );
  if (!packProduct) throw new Error(`Pack product not found: ${packId}`);

  await adapty.makePurchase(packProduct);
  // After purchase, download the pack file from Supabase Storage
  await downloadPack(packId);
  return true;
}

export async function restorePurchases(): Promise<void> {
  await adapty.restorePurchases();
  // Entitlements update via webhook or direct profile refresh
}
```

### 7.3 Pack Download from Supabase Storage

> **[STUB — IMPLEMENT BEFORE SHIP]** `src/packs/downloaded.ts` is currently a
> stub returning `null`/`false`. To make it functional, install `react-native-fs`:
> ```bash
> npm install react-native-fs && cd ios && pod install
> ```
> Then replace the stub body with the full implementation shown below.
> The `downloadPack()` call in `purchasePack()` (Phase 7.2) will silently
> no-op until this is done.

```typescript
// src/packs/downloaded.ts
import { supabase } from '../supabase/client';
import RNFS from 'react-native-fs'; // npm install react-native-fs
import type { RawPuzzle } from '../types/puzzle';

const PACKS_DIR = `${RNFS.DocumentDirectoryPath}/packs`;

export async function downloadPack(
  packId: string,
  storagePath: string,
): Promise<void> {
  const { data, error } = await supabase.storage
    .from('packs')
    .download(storagePath);
  if (error) throw error;

  await RNFS.mkdir(PACKS_DIR);
  const destPath = `${PACKS_DIR}/${packId}.json`;
  const text = await data.text();
  await RNFS.writeFile(destPath, text, 'utf8');
}

export async function isPackDownloaded(packId: string): Promise<boolean> {
  const path = `${PACKS_DIR}/${packId}.json`;
  return RNFS.exists(path);
}

export async function loadDownloadedPack(
  packId: string,
): Promise<RawPuzzle[] | null> {
  const path = `${PACKS_DIR}/${packId}.json`;
  const exists = await RNFS.exists(path);
  if (!exists) return null;
  const json = await RNFS.readFile(path, 'utf8');
  return JSON.parse(json) as RawPuzzle[];
}
```

### 7.4 Adapty Webhook → Supabase Edge Function

Deploy to `supabase/functions/adapty-webhook/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GRANT_EVENTS = new Set([
  'subscription_started',
  'subscription_renewed',
  'trial_started',
  'trial_converted',
  'access_level_updated',
]);
const REVOKE_EVENTS = new Set([
  'subscription_expired',
  'trial_expired',
  'subscription_refunded',
]);
// Pack purchase event (one-time)
const PACK_PURCHASE_EVENT = 'non_subscription_purchase';

serve(async (req: Request) => {
  const url = new URL(req.url);
  if (
    url.searchParams.get('secret') !== Deno.env.get('ADAPTY_WEBHOOK_SECRET')
  ) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await req.json();
  const { customer_user_id, event_type, event_properties } = payload;

  if (!customer_user_id) {
    return new Response('OK', { status: 200 }); // anonymous, no mapping
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  if (GRANT_EVENTS.has(event_type)) {
    await supabase.from('user_entitlements').upsert(
      {
        user_id: customer_user_id,
        is_premium: true,
        premium_purchased_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  } else if (REVOKE_EVENTS.has(event_type)) {
    await supabase.from('user_entitlements').upsert(
      {
        user_id: customer_user_id,
        is_premium: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  } else if (event_type === PACK_PURCHASE_EVENT) {
    // vendorProductId format: "starbattle_pack_{packId}"
    const productId: string = event_properties.vendor_product_id ?? '';
    const packId = productId.replace('starbattle_pack_', '');
    if (packId) {
      // Append packId to owned_pack_ids array
      await supabase.rpc('add_owned_pack', {
        p_user_id: customer_user_id,
        p_pack_id: packId,
      });
    }
  }

  await supabase.from('adapty_events').insert({
    profile_id: payload.profile_id,
    customer_user_id,
    event_type,
    event_properties,
    received_at: new Date().toISOString(),
  });

  return new Response('OK', { status: 200 });
});
```

Add the RPC function to Supabase:

```sql
create or replace function add_owned_pack(p_user_id uuid, p_pack_id text)
returns void language plpgsql security definer as $$
begin
  insert into user_entitlements (user_id, owned_pack_ids, updated_at)
    values (p_user_id, array[p_pack_id], now())
  on conflict (user_id) do update
    set owned_pack_ids = array_append(
      array_remove(user_entitlements.owned_pack_ids, p_pack_id), -- deduplicate
      p_pack_id
    ),
    updated_at = now();
end;
$$;
```

---

## Phase 8: Navigation (Typed Static API)

Replace the current untyped navigator with the v7 static API:

```typescript
// src/navigation.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type StaticParamList,
} from '@react-navigation/native-stack';
import { HomeScreen } from './screens/HomeScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { PuzzleScreen } from './screens/PuzzleScreen';
import { StreaksScreen } from './screens/StreaksScreen';
import { AccountScreen } from './screens/AccountScreen';
import { useTheme } from './hooks/useTheme';

const Stack = createNativeStackNavigator({
  screens: {
    Home: { screen: HomeScreen },
    Library: { screen: LibraryScreen },
    Puzzle: { screen: PuzzleScreen },
    Streaks: { screen: StreaksScreen },
    Account: { screen: AccountScreen },
  },
});

// Global type augmentation — useNavigation() is fully typed everywhere
export type RootStackParamList = StaticParamList<typeof Stack>;
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

// Screen param types (co-locate with navigation.tsx for easy reference)
declare module '@react-navigation/native' {
  interface RootParamList {
    Home: undefined;
    Library: { packId: string };
    Puzzle:
      | { packId: string; puzzleIndex: number }
      | {
          streakType: 'daily' | 'weekly' | 'monthly';
          isArchive?: boolean;
          archiveKey?: string;
        };
    Streaks: undefined;
    Account: undefined;
  }
}

export function Navigation() {
  const theme = useTheme();
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          statusBarStyle: theme.isDark ? 'light' : 'dark',
        }}
      />
    </NavigationContainer>
  );
}
```

---

## Phase 9: Rendering — Skia Canvas

Replace `BoardView.tsx`, `CellView.tsx`, `CellGridSvg.tsx`, and `RegionBordersSvg.tsx` with a single `PuzzleCanvas.tsx`.

### 9.1 PuzzleCanvas

```typescript
// src/components/PuzzleCanvas.tsx
import React, { useMemo } from 'react';
import {
  Canvas,
  Rect,
  Path,
  Skia,
  Group,
  Circle,
  Line as SkiaLine,
  useDerivedValue,
} from '@shopify/react-native-skia';
import {
  GestureDetector,
  Gesture,
  type GestureType,
} from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import type { Puzzle } from '../types/puzzle';
import type { CellValue } from '../types/state';
import type { Theme } from '../hooks/useTheme';

// Region color palette (one per region ID)
const REGION_COLORS_LIGHT = [
  '#E8EAF6',
  '#E3F2FD',
  '#E8F5E9',
  '#FFF8E1',
  '#FCE4EC',
  '#F3E5F5',
  '#E0F7FA',
  '#FBE9E7',
  '#F9FBE7',
  '#EDE7F6',
  '#E0F2F1',
  '#FFF3E0',
];
const REGION_COLORS_DARK = [
  '#283593',
  '#1565C0',
  '#2E7D32',
  '#F9A825',
  '#AD1457',
  '#6A1B9A',
  '#00838F',
  '#BF360C',
  '#827717',
  '#4527A0',
  '#00695C',
  '#E65100',
];

interface PuzzleCanvasProps {
  puzzle: Puzzle;
  cells: CellValue[];
  autoMarks: Set<number>;
  errorCells: Set<number>;
  hintGhosts: Map<number, 'star' | 'mark'>;
  theme: Theme;
  canvasSize: number; // square size in px
  composedGesture: GestureType;
}

export function PuzzleCanvas({
  puzzle,
  cells,
  autoMarks,
  errorCells,
  hintGhosts,
  theme,
  canvasSize,
  composedGesture,
}: PuzzleCanvasProps) {
  const { size, regions } = puzzle;
  const cellSize = canvasSize / size;
  const regionColors = theme.isDark ? REGION_COLORS_DARK : REGION_COLORS_LIGHT;

  // Build region border path once per puzzle (regions don't change)
  const regionBorderPath = useMemo(() => {
    const path = Skia.Path.Make();
    const inset = 1.5; // half of border width

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const x = col * cellSize;
        const y = row * cellSize;

        // Right edge
        if (col + 1 < size && regions[row][col] !== regions[row][col + 1]) {
          path.moveTo(x + cellSize, y);
          path.lineTo(x + cellSize, y + cellSize);
        }
        // Bottom edge
        if (row + 1 < size && regions[row][col] !== regions[row + 1][col]) {
          path.moveTo(x, y + cellSize);
          path.lineTo(x + cellSize, y + cellSize);
        }
      }
    }
    // Outer border
    path.addRect(
      Skia.XYWHRect(
        inset,
        inset,
        canvasSize - inset * 2,
        canvasSize - inset * 2,
      ),
    );
    return path;
  }, [puzzle.id, canvasSize]);

  // Build inner grid path once per puzzle
  const innerGridPath = useMemo(() => {
    const path = Skia.Path.Make();
    for (let i = 1; i < size; i++) {
      path.moveTo(i * cellSize, 0);
      path.lineTo(i * cellSize, canvasSize);
      path.moveTo(0, i * cellSize);
      path.lineTo(canvasSize, i * cellSize);
    }
    return path;
  }, [puzzle.id, canvasSize]);

  return (
    <GestureDetector gesture={composedGesture}>
      <Canvas style={{ width: canvasSize, height: canvasSize }}>
        {/* 1. Region background fills */}
        {Array.from({ length: size }, (_, row) =>
          Array.from({ length: size }, (_, col) => {
            const idx = row * size + col;
            const region = regions[row][col];
            const isError = errorCells.has(idx);
            return (
              <Rect
                key={`bg-${idx}`}
                x={col * cellSize}
                y={row * cellSize}
                width={cellSize}
                height={cellSize}
                color={
                  isError
                    ? '#FFE0E0'
                    : regionColors[region % regionColors.length]
                }
              />
            );
          }),
        )}

        {/* 2. Inner grid lines */}
        <Path
          path={innerGridPath}
          color={theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'}
          style="stroke"
          strokeWidth={0.5}
        />

        {/* 3. Region borders */}
        <Path
          path={regionBorderPath}
          color={theme.isDark ? '#EBEDEF' : '#060607'}
          style="stroke"
          strokeWidth={3}
          strokeJoin="miter"
          strokeCap="square"
        />

        {/* 4. Cell markers */}
        {cells.map((value, idx) => {
          const row = Math.floor(idx / size);
          const col = idx % size;
          const x = col * cellSize;
          const y = row * cellSize;
          const cx = x + cellSize / 2;
          const cy = y + cellSize / 2;
          const ghost = hintGhosts.get(idx);
          const isAutoMark = autoMarks.has(idx);

          if (value === 1 || ghost === 'star') {
            return (
              <StarMark
                key={idx}
                cx={cx}
                cy={cy}
                cellSize={cellSize}
                isGhost={ghost === 'star'}
                color={theme.text}
              />
            );
          }
          if (value === 2 || ghost === 'mark') {
            return (
              <XMark
                key={idx}
                cx={cx}
                cy={cy}
                cellSize={cellSize}
                isGhost={ghost === 'mark'}
                isAuto={isAutoMark}
                color={theme.markColor}
              />
            );
          }
          return null;
        })}
      </Canvas>
    </GestureDetector>
  );
}

function StarMark({
  cx,
  cy,
  cellSize,
  isGhost,
  color,
}: {
  cx: number;
  cy: number;
  cellSize: number;
  isGhost: boolean;
  color: string;
}) {
  const r = cellSize * 0.28;
  return (
    <Circle cx={cx} cy={cy} r={r} color={isGhost ? color + '55' : color} />
  );
}

function XMark({
  cx,
  cy,
  cellSize,
  isGhost,
  isAuto,
  color,
}: {
  cx: number;
  cy: number;
  cellSize: number;
  isGhost: boolean;
  isAuto: boolean;
  color: string;
}) {
  const half = cellSize * 0.22;
  const opacity = isGhost ? '55' : isAuto ? 'AA' : 'FF';
  const c = color + opacity;
  return (
    <Group>
      <SkiaLine
        p1={{ x: cx - half, y: cy - half }}
        p2={{ x: cx + half, y: cy + half }}
        color={c}
        strokeWidth={2}
        strokeCap="round"
      />
      <SkiaLine
        p1={{ x: cx + half, y: cy - half }}
        p2={{ x: cx - half, y: cy + half }}
        color={c}
        strokeWidth={2}
        strokeCap="round"
      />
    </Group>
  );
}
```

### 9.2 Gesture Composition (GH v3 + activateAfterLongPress)

Update `useDrawGesture.ts` and `useZoom.ts` for GH v3 syntax and `activateAfterLongPress`:

```typescript
// src/hooks/useDrawGesture.ts — alpha version
import { Gesture } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import { runOnJS } from 'react-native-reanimated';
import { usePuzzleStore } from '../store';
import type { CellValue, CellChange } from '../types/state';

export function useDrawGesture(
  gridSize: number,
  cellSize: number,
  scale: SharedValue<number>,
  translateX: SharedValue<number>,
  translateY: SharedValue<number>,
  canvasOrigin: { x: number; y: number }, // origin of canvas in screen coords
) {
  const tapCell = usePuzzleStore(s => s.tapCell);
  const applyDrawStroke = usePuzzleStore(s => s.applyDrawStroke);
  const cells = usePuzzleStore(s => s.cells);

  // Track stroke changes for batched commit
  const strokeChanges: CellChange[] = [];
  const visitedCells = new Set<number>();

  function hitTest(
    screenX: number,
    screenY: number,
  ): { row: number; col: number } | null {
    'worklet';
    // Transform screen coords to canvas-local coords
    const boardX = (screenX - canvasOrigin.x - translateX.value) / scale.value;
    const boardY = (screenY - canvasOrigin.y - translateY.value) / scale.value;
    const col = Math.floor(boardX / cellSize);
    const row = Math.floor(boardY / cellSize);
    if (col < 0 || col >= gridSize || row < 0 || row >= gridSize) return null;
    return { row, col };
  }

  const drawGesture = Gesture.Pan()
    .activateAfterLongPress(300)
    .maxPointers(1)
    .onActivate(e => {
      'worklet';
      strokeChanges.length = 0;
      visitedCells.clear();
      const cell = hitTest(e.absoluteX, e.absoluteY);
      if (cell) {
        const idx = cell.row * gridSize + cell.col;
        if (!visitedCells.has(idx)) {
          visitedCells.add(idx);
          const current = cells[idx] as CellValue;
          const next: CellValue = current === 0 ? 2 : 0;
          strokeChanges.push({ index: idx, prev: current, next });
        }
      }
    })
    .onUpdate(e => {
      'worklet';
      const cell = hitTest(e.absoluteX, e.absoluteY);
      if (!cell) return;
      const idx = cell.row * gridSize + cell.col;
      if (!visitedCells.has(idx)) {
        visitedCells.add(idx);
        const current = cells[idx] as CellValue;
        const next: CellValue = current === 0 ? 2 : 0;
        strokeChanges.push({ index: idx, prev: current, next });
      }
    })
    .onEnd(() => {
      'worklet';
      if (strokeChanges.length > 0) {
        runOnJS(applyDrawStroke)([...strokeChanges]);
      }
    });

  return { drawGesture };
}
```

Compose in PuzzleScreen:

```typescript
// Gesture composition in PuzzleScreen
const tapGesture = Gesture.Tap()
  .maxDuration(250)
  .onEnd(e => {
    'worklet';
    const col = Math.floor(e.x / cellSize);
    const row = Math.floor(e.y / cellSize);
    if (col >= 0 && col < puzzle.size && row >= 0 && row < puzzle.size) {
      runOnJS(tapCell)(row, col);
    }
  });

const composed = Gesture.Simultaneous(
  Gesture.Simultaneous(pinchGesture, panGesture),
  Gesture.Exclusive(drawGesture, tapGesture),
);
```

### 9.3 Haptics Update (Nitro)

```typescript
// src/utils/haptics.ts — alpha version
import { Haptics } from 'react-native-nitro-haptics';
import { NitroModules } from 'react-native-nitro-modules';

// Box for worklet use
export const boxedHaptics = NitroModules.box(Haptics);

// Non-worklet helpers (for non-gesture code)
export function hapticLight(): void {
  Haptics.impact('light');
}

export function hapticSuccess(): void {
  Haptics.notification('success');
}

export function hapticMedium(): void {
  Haptics.impact('medium');
}
```

---

## Phase 10: Screens

### HomeScreen

```
HomeScreen layout:
  Header (app title | streak button | account button)
  ─────────────────────────────────────────────────
  [Continue section — shows if any puzzle is in-progress]
    "Continue" card with pack name + puzzle # + progress bar
  ─────────────────────────────────────────────────
  Daily | Weekly | Monthly cards (3 across)
  ─────────────────────────────────────────────────
  Scrollable library list:
    FREE PACKS (9 cards)
      Completed: checkmark + count
      In progress: progress bar
      Locked paid: lock icon + price
    PAID PACKS (catalog from PowerSync)
      Owned: play arrow
      Not owned: lock icon + price
```

Key logic change from beta: `HomeScreen` reads from:

- `useEntitlementsStore` for which packs are accessible
- `useAuthStore` for user role (anonymous/free/premium)
- PowerSync SQLite for pack catalog and progress counts

```typescript
// HomeScreen: pack list rendering
const { packCatalog, entitlements } = useEntitlementsStore();

// Split packs into free (bundled) and paid (from catalog)
const freePacks = packCatalog.filter(p => p.isFree);
const paidPacks = packCatalog.filter(p => !p.isFree);

// For each pack: determine access and progress
function getPackState(pack: PackCatalogItem) {
  const hasAccess = hasPackAccess(pack.id);
  const completedCount = // async from PowerSync
  return { hasAccess, completedCount };
}
```

### LibraryScreen (formerly PackScreen)

Same grid layout as beta. Logic changes:

- Reads completion status per puzzle from PowerSync
- `canPlayPuzzle(packId, idx, completedCount)` from `useEntitlementsStore`
- Locked puzzles show a paywall prompt when tapped (not just grayed out)

### PuzzleScreen

Structure same as beta. Changes:

- Uses `PuzzleCanvas` instead of `BoardView`
- `loadPuzzle` is `async` (awaits `loadProgress`)
- Saves progress via `saveProgress()` (PowerSync write)
- `useEffect` cleanup calls `saveProgress` before unmount (fixes the no-`onBeforeRemove` bug)

```typescript
// PuzzleScreen — onBeforeRemove handler (new)
useEffect(() => {
  const unsubscribe = navigation.addListener('beforeRemove', () => {
    const state = usePuzzleStore.getState();
    if (state.puzzle) {
      saveProgress(
        state.puzzle.id,
        state.cells,
        state.autoMarks,
        state.timeMs,
        state.completed,
      );
    }
  });
  return unsubscribe;
}, [navigation]);
```

### StreaksScreen (new)

```
StreaksScreen layout:
  Header (back | "Streaks")
  ─────────────────────────────────────────────────
  Daily streak count + current streak
  Weekly streak count + current streak
  Monthly streak count + current streak
  ─────────────────────────────────────────────────
  "Past Puzzles" section:
    [Premium only] — Scrollable list of past daily/weekly/monthly packs
    [Non-premium] — Teaser with "Unlock with Premium" CTA
```

Past streak puzzle access: premium users can tap any past date key. The puzzle ID format for archives is `{type}:archive:{dateKey}`. The puzzle index is `dateKey % packSize` (same deterministic formula as live streaks).

### AccountScreen (new)

```
AccountScreen layout:
  [If anonymous]
    "Sign up to sync your progress"
    [Sign up with Apple]
    [Sign up with Email]
    ─────────────────────────────────────
    "Already have an account? Sign in"
  [If signed in]
    Email / Sign-in method
    ─────────────────────────────────────
    Entitlements:
      "Premium" badge (if premium)
      Owned packs list
    ─────────────────────────────────────
    [Buy Premium $5.99] (if not premium)
    [Restore Purchases]
    [Sign Out]
    ─────────────────────────────────────
  Settings section (same toggles as current SettingsModal):
    Auto-X Neighbors / Rows & Cols / Regions
    Highlight Errors
    Show Timer / Hide Toolbar / Haptics
    Theme selector
```

### PaywallModal (new)

Context-aware modal shown when a locked puzzle or pack is tapped:

```typescript
// Scenarios:
// 1. Free pack, sequential lock:
//    "Complete the previous puzzle to unlock this one."
//    [Buy Premium — $5.99 · Unlock all puzzles]
//
// 2. Paid pack, not owned, no account:
//    "Create an account to purchase Pack Name for $1.99."
//    [Create Account]
//
// 3. Paid pack, not owned, has account:
//    "Buy Pack Name · $1.99"
//    [Buy Premium · $5.99 · Includes all packs]
//
// 4. Paid pack, not owned, is premium:
//    [should never show — premium unlocks all]

type PaywallContext =
  | { type: 'sequential'; packId: string; puzzleIndex: number }
  | {
      type: 'paid-pack';
      packId: string;
      packName: string;
      priceUsd: number;
      storagePath: string;
    };
```

---

## Phase 11: Streak System Update

The current streak logic in `streakDate.ts` is correct and carries forward unchanged. Update `recordStreak` to write via PowerSync instead of MMKV:

```typescript
// In store.ts or a new streakActions.ts
import { getCurrentKey, getPreviousKey } from '../utils/streakDate';
import { saveStreak, loadStreaks } from '../utils/progress';
import type { StreakType } from '../types/state';

export async function recordStreak(type: StreakType): Promise<void> {
  const streaks = await loadStreaks();
  const currentKey = getCurrentKey(type);
  const prevKey = getPreviousKey(type);
  const existing = streaks.find(s => s.type === type);

  if (existing?.lastCompletedKey === currentKey) return; // already recorded

  const newCount =
    existing?.lastCompletedKey === prevKey
      ? (existing.currentCount ?? 0) + 1
      : 1;

  await saveStreak(type, newCount, currentKey);
}
```

**Past streak archive (premium):** The archive is driven by the `streak_archive` table synced via PowerSync. Each row maps a calendar period (`date_key`) to a specific `puzzle_id`. The app looks up which puzzle to load from local SQLite rather than deriving it from an epoch offset. Only rows whose `date_key` is on or before today are shown in the archive UI.

```typescript
// src/utils/streakDate.ts — look up archive puzzle from PowerSync
import { db } from '../powersync/database';
import type { StreakType } from '../types/state';

export async function getArchivePuzzleId(
  type: StreakType,
  dateKey: string,
): Promise<string | null> {
  const result = await db.getOptional<{ puzzle_id: string }>(
    'SELECT puzzle_id FROM streak_archive WHERE type = ? AND date_key = ?',
    [type, dateKey],
  );
  return result?.puzzle_id ?? null;
}

// Returns all past archive entries for a type (date_key <= today)
export async function getPastArchive(
  type: StreakType,
  todayKey: string,
): Promise<Array<{ dateKey: string; puzzleId: string }>> {
  const rows = await db.getAll<{ date_key: string; puzzle_id: string }>(
    'SELECT date_key, puzzle_id FROM streak_archive WHERE type = ? AND date_key <= ? ORDER BY date_key DESC',
    [type, todayKey],
  );
  return rows.map(r => ({ dateKey: r.date_key, puzzleId: r.puzzle_id }));
}
```

**Admin script — assigning puzzles to dates:** Before uploading puzzles to the archive, run a script that reads the SBN list, processes it through the Rust generator, and inserts rows into `streak_archive` with explicit `date_key` assignments. The script assigns dates sequentially starting from a given start date. No automatic rotation logic exists on the client — the database is authoritative.

---

## Phase 12: Pack Loading

Pack display names always come from the `name` field in the pack metadata row (synced from the `packs` table via PowerSync). They are never derived from the pack ID. Pack IDs are opaque identifiers used for lookups only.

**Free pack priority order:** downloaded cloud version → bundled JSON fallback. On startup, the app checks Supabase Storage for newer versions of all free packs and downloads them in the background using `react-native-fs`. The bundled JSON files in the repo serve as the offline fallback if no download has occurred.

```typescript
// src/packs/index.ts — alpha version
import RNFS from 'react-native-fs';
import { supabase } from '../supabase/client';
import type { RawPuzzle, Pack } from '../types/puzzle';

// Bundled free packs — offline fallback
import fiveByFiveNormal from '../../packs/5x5-normal.json';
import sixBySixNormal from '../../packs/6x6-normal.json';
// ... etc

const BUNDLED_PACKS: Record<string, RawPuzzle[]> = {
  '5x5-normal': (fiveByFiveNormal as any).puzzles,
  '6x6-normal': (sixBySixNormal as any).puzzles,
  // ...
};

// Streak packs (bundled, updated same way as free packs)
import dailyJson from '../../packs/daily.json';
import weeklyJson from '../../packs/weekly.json';
import monthlyJson from '../../packs/monthly.json';

export const streakPacks = {
  daily: dailyJson as any as Pack,
  weekly: weeklyJson as any as Pack,
  monthly: monthlyJson as any as Pack,
};

const PACK_DIR = `${RNFS.DocumentDirectoryPath}/packs`;

// Attempt to load a previously downloaded pack JSON from the filesystem
async function loadDownloadedPack(packId: string): Promise<RawPuzzle[] | null> {
  const path = `${PACK_DIR}/${packId}.json`;
  const exists = await RNFS.exists(path);
  if (!exists) return null;
  const raw = await RNFS.readFile(path, 'utf8');
  return (JSON.parse(raw) as { puzzles: RawPuzzle[] }).puzzles;
}

// Get puzzles for a pack: downloaded cloud version → bundled fallback
export async function getPuzzlesForPack(
  packId: string,
): Promise<RawPuzzle[] | null> {
  const downloaded = await loadDownloadedPack(packId);
  if (downloaded) return downloaded;
  return BUNDLED_PACKS[packId] ?? null;
}

// Background: download updated free pack JSON from Supabase Storage
// Called once on app startup; silently skips on network error
export async function refreshFreePacks(freePackIds: string[]): Promise<void> {
  await RNFS.mkdir(PACK_DIR).catch(() => {});
  for (const packId of freePackIds) {
    try {
      const { data } = await supabase.storage
        .from('packs')
        .download(`${packId}.json`);
      if (!data) continue;
      const text = await data.text();
      await RNFS.writeFile(`${PACK_DIR}/${packId}.json`, text, 'utf8');
    } catch {
      // Non-fatal: bundled fallback will be used
    }
  }
}

// Download a purchased paid pack from Supabase Storage
export async function downloadPaidPack(
  packId: string,
  storagePath: string,
): Promise<void> {
  await RNFS.mkdir(PACK_DIR).catch(() => {});
  const { data } = await supabase.storage.from('packs').download(storagePath);
  if (!data) throw new Error(`Failed to download pack ${packId}`);
  const text = await data.text();
  await RNFS.writeFile(`${PACK_DIR}/${packId}.json`, text, 'utf8');
}
```

---

## Phase 13: Error Boundaries

Wrap screens to prevent crashes propagating to root:

```typescript
// src/components/ErrorBoundary.tsx
import React from 'react';
import { View, Text, Pressable } from 'react-native';

interface Props {
  children: React.ReactNode;
  onReset?: () => void;
}
interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.error('Boundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
        >
          <Text>Something went wrong.</Text>
          <Pressable
            onPress={() => {
              this.setState({ hasError: false });
              this.props.onReset?.();
            }}
          >
            <Text>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
```

Wrap PuzzleScreen:

```typescript
<ErrorBoundary onReset={() => navigation.goBack()}>
  <PuzzleScreen ... />
</ErrorBoundary>
```

---

## What Carries Forward Unchanged

These files from the beta are correct and require only minor wiring updates:

| File                             | Status                                                                  |
| -------------------------------- | ----------------------------------------------------------------------- |
| `src/utils/puzzleLogic.ts`       | Keep entirely — all constraint/win logic is correct                     |
| `src/utils/parsePuzzle.ts`       | Keep — add input validation (check `LETTERS.indexOf >= 0`)              |
| `src/utils/streakDate.ts`        | Keep entirely — streak key math is correct                              |
| `src/utils/formatTime.ts`        | Keep                                                                    |
| `src/store.ts` (game logic)      | Keep all actions — only loadPuzzle and persist calls change             |
| `src/hooks/useTheme.ts`          | Keep — add `markColor` rename, make `cellSize` screen-adaptive          |
| `src/components/Toolbar.tsx`     | Keep                                                                    |
| `src/components/WinBanner.tsx`   | Keep                                                                    |
| `src/components/Header.tsx`      | Keep                                                                    |
| `src/components/HeaderTimer.tsx` | Keep                                                                    |
| `packs/*.json`                   | Keep — SBN format unchanged, IDs need alignment with new pack ID scheme |

---

## Implementation Sequence

Build in this order — each phase is independently testable:

```
Phase 0  │ Packages, project structure, types
Phase 1  │ Supabase schema + RLS + trigger
Phase 2  │ PowerSync setup (schema, connector, sync rules)
Phase 3  │ Supabase auth + authStore (anonymous-first)
Phase 4  │ settingsStore (MMKV, extract from old userStore)
Phase 5  │ Progress via PowerSync (saveProgress, loadProgress)
Phase 6  │ entitlementsStore (reads from local SQLite)
Phase 7  │ Navigation typed static API
Phase 8  │ PuzzleCanvas (Skia) — replaces BoardView + SVG
Phase 9  │ PuzzleScreen wired to new canvas + progress
Phase 10 │ HomeScreen + LibraryScreen redesign
Phase 11 │ Adapty SDK + PaywallModal + purchase flows
Phase 12 │ Adapty webhook Edge Function
Phase 13 │ StreaksScreen + past puzzle archive (premium)
Phase 14 │ AccountScreen (auth UI + settings)
Phase 15 │ Error boundaries + offline polish
```

Each phase after Phase 5 can be tested with the puzzle gameplay working. Phases 11–13 require Adapty sandbox and Supabase Edge Functions deployed.

---

## Admin Ingestion Pipeline

New packs start as raw `.sbn` files — lists of Star Battle Notation strings (e.g., `puzzles-5x1.sbn`). An admin script processes them before they reach Supabase.

**Pipeline steps:**

1. Read the `.sbn` file line by line (one puzzle per line)
2. Run each SBN string through the Rust generator at `github.com/masonomara/star-battle` to produce: solution coordinates + hint steps
3. Format each puzzle as a `RawPuzzle` object (`{ sbn, solution, hints }`)
4. Write the full array to a `{packId}.json` file: `{ puzzles: RawPuzzle[] }`
5. Upload the JSON to Supabase Storage bucket `packs/` at path `{packId}.json`
6. Insert (or upsert) a row into the `packs` table with the pack's metadata, `storage_path`, and `published = true`

Free packs follow the same pipeline — after upload they become the cloud-authoritative source. The repo-bundled JSON is generated from the same script and committed as the offline fallback.

**Streak archive assignment script:** After generating daily/weekly/monthly puzzles, a second script assigns each puzzle a `date_key` and inserts rows into the `streak_archive` table. Dates are assigned sequentially from a given start date. Once inserted, a puzzle appears in the archive UI as soon as its `date_key` has passed.

**File system:**

- `react-native-fs` is confirmed for all file I/O (free pack refresh, paid pack downloads). No Expo dependency.
- Pack IDs are opaque — display names always come from the `name` metadata field in the `packs` table, never derived from the ID string.
- Anonymous users' progress is device-local by design. A new anonymous session on a second device gets no cross-device sync. Signing in with an account is the upgrade path.

---

## TODO

Tasks are labeled **[YOU]** (done in a dashboard, GUI, or third-party service — no code) or **[CLAUDE]** (code implementation). Do all **[YOU]** tasks in a phase before handing off to Claude for that phase's **[CLAUDE]** tasks, unless noted otherwise.

---

### Pre-Implementation: Account & Service Setup

These must be done before any code is written.

- [x] **[YOU]** Create a Supabase project at supabase.com. Note the Project URL and anon key.
- [x] **[YOU]** In the Supabase dashboard: enable **Anonymous Sign-In** under Authentication → Providers.
- [x] **[YOU]** In Supabase Storage: create a bucket named `packs`. Set it to **private** (downloads go through signed URLs or the service role key).
- [x] **[YOU]** Create a PowerSync cloud instance at powersync.com. Connect it to your Supabase project using the Supabase connection string.
- [x] **[YOU]** Create an Adapty account at adapty.io. Start a free tier project.
- [x] **[YOU]** In your Apple Developer account: register an App ID for the alpha bundle identifier (if not already done).
- [x] **[YOU]** Add environment variables to the project. Create a `.env` file (or use whatever env-loading approach is already in the project) with: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `POWERSYNC_URL`, `ADAPTY_SDK_KEY`.

---

### Phase 0: Foundation

- [x] **[CLAUDE]** Remove `react-native-svg` and `react-native-haptic-feedback`. Install all new packages per the Phase 0 package list. Run `pod install`.
- [x] **[CLAUDE]** Restructure `src/` to match the Phase 0.2 directory layout. Create empty placeholder files for every new module so imports resolve.
- [x] **[CLAUDE]** Update `src/types/state.ts` — remove `ProgressState` and `UserState`, add new types per Phase 0.3.
- [x] **[CLAUDE]** Create `src/types/user.ts` with `UserRole`, `Entitlements`, and `PackCatalogItem`.
- [x] **[YOU]** Run `pod install` in `ios/` then verify the app builds and launches (even with placeholder screens) after package changes.

---

### Phase 1: Supabase Schema

- [ ] **[YOU]** In the Supabase SQL editor: run the full migration from Phase 1 — all `CREATE TABLE` statements, RLS policies, the `handle_new_user` trigger, the `add_owned_pack` RPC, and the free pack seed `INSERT`.
- [ ] **[YOU]** Verify in the Supabase Table Editor that all tables exist: `packs`, `puzzle_progress`, `streaks`, `user_entitlements`, `adapty_events`, `streak_archive`.
- [ ] **[YOU]** Confirm the 9 free pack rows are present in the `packs` table.

---

### Phase 2: PowerSync Setup

- [ ] **[YOU]** In the PowerSync dashboard: deploy `sync-rules.yaml` from Phase 2.1. Confirm it validates without errors.
- [ ] **[YOU]** Copy the PowerSync instance URL. Add it to your env as `POWERSYNC_URL`.
- [ ] **[CLAUDE]** Create `src/powersync/AppSchema.ts` with the full client SQLite schema (packs, puzzle_progress, streaks, user_entitlements, streak_archive).
- [ ] **[CLAUDE]** Create `src/powersync/database.ts` — PowerSync singleton using op-sqlite.
- [ ] **[CLAUDE]** Create `src/powersync/Connector.ts` — `SupabaseConnector` with `fetchCredentials` and `uploadData`.
- [ ] **[CLAUDE]** Create `src/supabase/client.ts` — Supabase JS client with MMKV auth storage adapter.
- [ ] **[CLAUDE]** Update `App.tsx` — initialize sequence: Adapty → settings → auth → PowerSync connect.
- [ ] **[YOU]** Launch app, confirm PowerSync connects without error (check console logs).

---

### Phase 3: Auth Store

- [ ] **[YOU]** In Supabase dashboard under Authentication → Providers: confirm Anonymous is enabled (already done in pre-setup). No additional configuration needed for anonymous auth.
- [ ] **[CLAUDE]** Create `src/stores/authStore.ts` — anonymous-first, Apple Sign In, email sign-up/sign-in, sign-out, anon→account upgrade, Adapty identify.
- [ ] **[CLAUDE]** Wire `authStore.initialize()` into `App.tsx` startup sequence.
- [ ] **[YOU]** Run app. Verify an anonymous session is created on first launch and persists across restarts (check Supabase Auth → Users for the anonymous user row).

---

### Phase 4: Entitlements Store

- [ ] **[CLAUDE]** Create `src/stores/entitlementsStore.ts` — reads `user_entitlements` and `packs` from local SQLite, exposes `hasPackAccess`, `canPlayPuzzle`, `canPlayPack`.
- [ ] **[CLAUDE]** Wire `db.watch` on `user_entitlements` in `App.tsx` to reload entitlements on any sync update.
- [ ] **[CLAUDE]** Create `src/hooks/useEntitlements.ts` — convenience hook over entitlementsStore for component use.

---

### Phase 5: Settings Store

- [ ] **[CLAUDE]** Create `src/stores/settingsStore.ts` — MMKV-backed settings, extracted from the old `userStore.ts`.
- [ ] **[CLAUDE]** Update `src/storage.ts` — strip out progress and streak functions (those move to PowerSync), keep only settings get/set.
- [ ] **[CLAUDE]** Wire `settingsStore.initialize()` into `App.tsx` startup (before auth).

---

### Phase 6: Progress via PowerSync

- [ ] **[CLAUDE]** Create `src/utils/progress.ts` — `saveProgress`, `loadProgress`, `getCompletedCountForPack`, `saveStreak`, `loadStreaks` — all reading/writing local SQLite via PowerSync.
- [ ] **[CLAUDE]** Update `src/store.ts` — make `loadPuzzle` async (awaits `loadProgress`), replace all `persistProgress` calls with `saveProgress` (fire-and-forget), remove the 5-second autosave interval.
- [ ] **[CLAUDE]** Delete `src/utils/persistProgress.ts` and remove all references.
- [ ] **[YOU]** Play a puzzle partway through. Kill the app. Reopen. Verify progress is restored from SQLite.

---

### Phase 7: Payments (Adapty)

**Adapty dashboard setup — do this before Claude writes any payment code:**

- [ ] **[YOU]** In the Adapty dashboard: create a **Product** named `starbattle_premium` — one-time, $5.99, link to App Store product (create the App Store product first if it doesn't exist).
- [ ] **[YOU]** In App Store Connect: create the `starbattle_premium` in-app purchase (non-consumable, $5.99). Note the vendor product ID matches exactly.
- [ ] **[YOU]** In Adapty: create an **Access Level** named `premium`.
- [ ] **[YOU]** In Adapty: create a **Paywall** named `main_paywall` containing the premium product (add paid pack products later as they are created).
- [ ] **[YOU]** In Adapty: configure the **Webhook** URL. This will point to the Supabase Edge Function URL (`https://{project}.supabase.co/functions/v1/adapty-webhook?secret={ADAPTY_WEBHOOK_SECRET}`). Set the secret value — note it for the next step.
- [ ] **[YOU]** In Supabase → Edge Functions → Secrets: add `ADAPTY_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] **[YOU]** Add `ADAPTY_SDK_KEY` to your app env (get it from Adapty dashboard → App Settings).

**Code — after dashboard is configured:**

- [ ] **[CLAUDE]** Create `src/utils/payments.ts` — `fetchPaywall`, `purchasePremium`, `purchasePack`, `restorePurchases`.
- [ ] **[CLAUDE]** Create `src/packs/downloaded.ts` — `downloadPack`, `isPackDownloaded`, `loadDownloadedPack` using `react-native-fs`.
- [ ] **[CLAUDE]** Write and deploy Supabase Edge Function `supabase/functions/adapty-webhook/index.ts` — handles grant/revoke premium events and pack purchase events, writes to `user_entitlements` and calls `add_owned_pack`.
- [ ] **[YOU]** Use Adapty's sandbox/test mode to trigger a test purchase event. Verify the webhook fires and `user_entitlements` updates in Supabase. Verify PowerSync syncs the change to the device and entitlements update in-app without a restart.

---

### Phase 8: Navigation

- [ ] **[CLAUDE]** Rewrite `src/navigation.tsx` with the React Navigation v7 typed static API — all 5 screens (Home, Library, Puzzle, Streaks, Account), fully typed params, global type augmentation.
- [ ] **[YOU]** Confirm all existing screens still render and navigation between them works.

---

### Phase 9: Rendering (Skia Canvas)

- [ ] **[CLAUDE]** Create `src/components/PuzzleCanvas.tsx` — single Skia canvas replacing `BoardView`, `CellView`, `CellGridSvg`, and `RegionBordersSvg`. Renders region fills, inner grid, region borders, star marks, X marks, hint ghosts.
- [ ] **[CLAUDE]** Update `src/hooks/useDrawGesture.ts` for GH v3 — `activateAfterLongPress(300)`, new hooks API, worklet-safe coordinate math.
- [ ] **[CLAUDE]** Update `src/hooks/useZoom.ts` for GH v3 — update pinch + pan syntax, keep spring physics and boundary clamping.
- [ ] **[CLAUDE]** Update `src/utils/haptics.ts` — switch to `react-native-nitro-haptics` with `NitroModules.box(Haptics)` for worklet use.
- [ ] **[CLAUDE]** Delete `src/components/BoardView.tsx`, `CellView.tsx`, `CellGridSvg.tsx`, `RegionBordersSvg.tsx`.
- [ ] **[YOU]** Play a full puzzle. Verify: region colors, borders, grid lines, star placement, X marks, auto-marks, error highlighting, hint ghosts, pinch-zoom, drag-to-mark, haptics.

---

### Phase 10: Screens

- [ ] **[CLAUDE]** Rewrite `src/screens/HomeScreen.tsx` — header with streak + account buttons, continue card (if in-progress puzzle), Daily/Weekly/Monthly streak cards, scrollable pack list (free + paid from catalog), lock state driven by entitlementsStore.
- [ ] **[CLAUDE]** Rename `PackScreen.tsx` → `LibraryScreen.tsx`. Update to read completion per puzzle from PowerSync, use `canPlayPuzzle` for lock state, show paywall on locked tap.
- [ ] **[CLAUDE]** Update `src/screens/PuzzleScreen.tsx` — replace BoardView with PuzzleCanvas, make `loadPuzzle` async, save progress on `beforeRemove` event, remove 5-second interval autosave.
- [ ] **[CLAUDE]** Create `src/screens/StreaksScreen.tsx` — streak counts for daily/weekly/monthly, past archive list (premium only), premium upsell teaser for non-premium.
- [ ] **[CLAUDE]** Create `src/screens/AccountScreen.tsx` — sign-up/sign-in (anonymous state), signed-in state with entitlements, buy premium, restore purchases, sign out, settings toggles (replaces SettingsModal).
- [ ] **[CLAUDE]** Create `src/components/PaywallModal.tsx` — context-aware with the 4 scenarios: sequential lock, paid pack (no account), paid pack (has account), premium CTA.
- [ ] **[YOU]** Walk through all screen flows: home → library → puzzle → win → next, home → streaks, home → account → sign up, paywall scenarios for each lock type.

---

### Phase 11: Streak System Update

- [ ] **[CLAUDE]** Update `recordStreak` in `src/store.ts` (or extract to `src/utils/streakActions.ts`) — write via `saveStreak` (PowerSync) instead of MMKV.
- [ ] **[CLAUDE]** Add `getArchivePuzzleId` and `getPastArchive` to `src/utils/streakDate.ts` — query `streak_archive` from local SQLite.
- [ ] **[CLAUDE]** Wire `getPastArchive` into `StreaksScreen` to render the past puzzle list for premium users.
- [ ] **[YOU]** Complete a daily puzzle. Verify streak counter increments and persists after app restart.

---

### Phase 12: Pack Loading

- [ ] **[CLAUDE]** Rewrite `src/packs/index.ts` — `refreshFreePacks` (background download from Supabase Storage), `downloadPaidPack`, `getPuzzlesForPack` (downloaded → bundled fallback priority).
- [ ] **[CLAUDE]** Call `refreshFreePacks` in `App.tsx` after PowerSync connects (fire-and-forget).
- [ ] **[YOU]** Upload the 9 free pack JSON files to Supabase Storage bucket `packs/` at paths matching pack IDs (e.g. `5x5-normal.json`). These files should already exist in the beta `packs/` folder — rename them to match the new IDs as needed.
- [ ] **[YOU]** Verify `refreshFreePacks` downloads and overwrites local copies on app startup. Verify `getPuzzlesForPack` returns puzzles correctly for a free pack.

---

### Phase 13: Error Boundaries

- [ ] **[CLAUDE]** Create `src/components/ErrorBoundary.tsx` — class component with `getDerivedStateFromError`, "Try Again" fallback UI.
- [ ] **[CLAUDE]** Wrap `PuzzleScreen`, `HomeScreen`, and `LibraryScreen` with `<ErrorBoundary>`.
- [ ] **[CLAUDE]** Add input validation to `src/utils/parsePuzzle.ts` — validate SBN header format, region letter range, and array lengths before parsing.

---

### Admin Data Pipeline

Do this before launch to seed all puzzle content.

**Free packs (9 libraries):**

- [ ] **[YOU]** Confirm you have `.sbn` files for all 9 free pack libraries and the daily/weekly/monthly streak packs.
- [ ] **[CLAUDE]** Write an admin ingestion script (`scripts/ingest-pack.ts`) that: reads a `.sbn` file → calls the Rust generator at `github.com/masonomara/star-battle` for each puzzle to get solution + hints → formats as `RawPuzzle[]` → writes `{packId}.json` → uploads to Supabase Storage → upserts the `packs` row.
- [ ] **[YOU]** Run `ingest-pack.ts` for each of the 9 free libraries. Verify each JSON appears in Supabase Storage and the `packs` table row is correct.
- [ ] **[YOU]** Commit the generated JSON files to the repo as the bundled offline fallback.

**Streak archive:**

- [ ] **[CLAUDE]** Write a streak archive assignment script (`scripts/assign-streak-dates.ts`) that: reads a streak `.sbn` file (daily/weekly/monthly) → generates puzzle JSON via the Rust generator → inserts `streak_archive` rows assigning each puzzle a sequential `date_key` starting from a given start date.
- [ ] **[YOU]** Choose start dates for daily, weekly, and monthly archives.
- [ ] **[YOU]** Run `assign-streak-dates.ts` for each type. Verify rows appear in `streak_archive` with correct `date_key` values.
- [ ] **[YOU]** Confirm that only past-dated puzzles appear in the StreaksScreen archive for a premium test account.

**Paid packs (if any at launch):**

- [ ] **[YOU]** For each paid pack: create the App Store in-app purchase in App Store Connect. Create the corresponding Adapty product. Add it to the `main_paywall`.
- [ ] **[CLAUDE]** Add the paid pack products to the ingestion script and run for each paid pack.
- [ ] **[YOU]** Verify the paid pack appears as locked (with price) in HomeScreen, paywall triggers correctly on tap, purchase flow works in sandbox.

---

### Apple Sign In Setup

Do this when AccountScreen is ready (after Phase 10).

- [ ] **[YOU]** In Apple Developer portal: enable Sign In with Apple capability for the app's App ID.
- [ ] **[YOU]** In Supabase dashboard under Authentication → Providers → Apple: enter your Services ID, Team ID, Key ID, and private key. Save.
- [ ] **[YOU]** In Xcode: add the Sign In with Apple entitlement to the target.
- [ ] **[YOU]** Test Apple Sign In on a physical device (Sign In with Apple does not work in the simulator). Verify the anonymous session is upgraded to a full account and progress carries over.

---

### Polish & Pre-Launch

These are judgment calls that belong to you, with Claude available to implement specific changes you decide on.

- [ ] **[YOU]** Review all screen designs. Decide on spacing, typography, color adjustments for light and dark mode.
- [ ] **[YOU]** Decide on transition animations between screens (native-stack defaults vs. custom).
- [ ] **[YOU]** Write final copy for PaywallModal, AccountScreen, and onboarding-adjacent text.
- [ ] **[YOU]** Design and export the app icon and launch screen.
- [ ] **[CLAUDE]** Implement any specific visual polish changes you specify after review.
- [ ] **[CLAUDE]** Wire up any remaining `useTheme` tokens that don't yet adapt to dark mode.
- [ ] **[YOU]** Offline testing: enable airplane mode, complete a puzzle, re-enable network, verify sync. Test on a second device with the same account.
- [ ] **[YOU]** Final App Store Connect submission: screenshots, description, review notes, build upload.
