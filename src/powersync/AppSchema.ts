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
  sort_order: column.integer,
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
  owned_pack_ids: column.text,
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
