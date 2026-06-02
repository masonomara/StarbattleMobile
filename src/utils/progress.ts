import { db } from '../powersync/AppSchema';
import { useAuthStore } from '../stores/authStore';
import { getCurrentKey, getPreviousKey } from './streakDate';
import type { CellValue, StreakType, Streak } from '../types';

// PowerSync exposes tables as views with INSTEAD OF triggers. rowsAffected is
// unreliable on views (SQLite does not count trigger-internal changes), so we
// SELECT first to decide INSERT vs UPDATE rather than trusting rowsAffected.
async function upsertById(
  table: string,
  id: string,
  insertSql: string,
  insertArgs: unknown[],
  updateSql: string,
  updateArgs: unknown[],
): Promise<void> {
  const existing = await db.getOptional<{ id: string }>(
    `SELECT id FROM ${table} WHERE id = ?`,
    [id],
  );
  if (existing) {
    await db.execute(updateSql, updateArgs);
  } else {
    await db.execute(insertSql, insertArgs);
  }
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
  const id = `${userId}:${puzzleId}`;
  const cellsJson = JSON.stringify(cells);
  const autoMarksJson = JSON.stringify([...autoMarks]);
  const completedInt = completed ? 1 : 0;
  const completedAt = completed ? now : null;

  await upsertById(
    'puzzle_progress',
    id,
    `INSERT INTO puzzle_progress
       (id, user_id, puzzle_id, cells, auto_marks, time_ms, completed, completed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, puzzleId, cellsJson, autoMarksJson, timeMs, completedInt, completedAt, now],
    `UPDATE puzzle_progress SET
       cells = ?,
       auto_marks = ?,
       time_ms = ?,
       completed = ?,
       completed_at = COALESCE(completed_at, ?),
       updated_at = ?
     WHERE id = ?`,
    [cellsJson, autoMarksJson, timeMs, completedInt, completedAt, now, id],
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

  const row = await db.getOptional<{
    cells: string;
    auto_marks: string | null;
    time_ms: number;
    completed: number;
  }>(
    'SELECT cells, auto_marks, time_ms, completed FROM puzzle_progress WHERE user_id = ? AND puzzle_id = ?',
    [userId, puzzleId],
  );

  if (!row) return null;
  try {
    const rawCells = JSON.parse(row.cells);
    const rawMarks = JSON.parse(row.auto_marks ?? '[]');
    if (!Array.isArray(rawCells) || !Array.isArray(rawMarks)) return null;
    return {
      cells: rawCells.map(v => Math.max(0, Math.min(2, Number(v) | 0)) as CellValue),
      autoMarks: rawMarks.filter((v): v is number => typeof v === 'number'),
      timeMs: row.time_ms,
      completed: row.completed === 1,
    };
  } catch {
    return null;
  }
}

// DEBT: getCompletedCountForPack and getCompletedPuzzleIdsForPack both call
// fetchCompletedIdsForPack, but getCompletedCountForPack discards the Set and
// returns only `.size`. The count-only variant could skip building the Set
// entirely with a COUNT(*) query for large packs. For current pack sizes this
// is fine, but worth revisiting if puzzle counts grow.
async function fetchCompletedIdsForPack(
  packId: string,
  puzzleCount: number,
): Promise<Set<string>> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId || puzzleCount === 0) return new Set();

  const ids = Array.from({ length: puzzleCount }, (_, i) => `${packId}:${i}`);
  const placeholders = ids.map(() => '?').join(',');

  const rows = await db.getAll<{ puzzle_id: string }>(
    `SELECT puzzle_id FROM puzzle_progress
     WHERE user_id = ? AND puzzle_id IN (${placeholders}) AND completed = 1`,
    [userId, ...ids],
  );
  return new Set(rows.map(r => r.puzzle_id));
}

export async function getCompletedCountForPack(
  packId: string,
  puzzleCount: number,
): Promise<number> {
  return (await fetchCompletedIdsForPack(packId, puzzleCount)).size;
}

export async function getCompletedPuzzleIdsForPack(
  packId: string,
  puzzleCount: number,
): Promise<Set<string>> {
  return fetchCompletedIdsForPack(packId, puzzleCount);
}

// Fetches every completed puzzle ID for the current user in one query.
// Scales O(n) with the number of completed puzzles — fine for typical usage.
// Used by useCompletionData to build both streak and library completion state.
export async function loadAllCompletionData(): Promise<Set<string>> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return new Set();
  const rows = await db.getAll<{ puzzle_id: string }>(
    'SELECT puzzle_id FROM puzzle_progress WHERE user_id = ? AND completed = 1',
    [userId],
  );
  return new Set(rows.map(r => r.puzzle_id));
}

export async function saveStreak(
  type: string,
  currentCount: number,
  lastCompletedKey: string,
): Promise<void> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return;

  const now = new Date().toISOString();
  const id = `${userId}:${type}`;

  await upsertById(
    'streaks',
    id,
    `INSERT INTO streaks (id, user_id, type, current_count, last_completed_key, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, type, currentCount, lastCompletedKey, now],
    `UPDATE streaks SET
       current_count = ?,
       last_completed_key = ?,
       updated_at = ?
     WHERE id = ?`,
    [currentCount, lastCompletedKey, now, id],
  );
}

// Imperative one-shot read of streak rows. For reactive updates (e.g. the
// home screen), use the useStreakRows hook instead — it subscribes to live
// PowerSync changes rather than running a single query.
export async function loadStreaks(): Promise<Streak[]> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return [];

  const rows = await db.getAll<{
    type: string;
    current_count: number;
    last_completed_key: string;
  }>(
    'SELECT type, current_count, last_completed_key FROM streaks WHERE user_id = ?',
    [userId],
  );
  return rows.map(r => ({
    type: r.type as StreakType,
    current: r.current_count,
    lastCompletedKey: r.last_completed_key,
  }));
}

export async function recordStreak(type: StreakType): Promise<void> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return;

  const currentKey = getCurrentKey(type);

  const existing = await db.getOptional<{
    id: string;
    current_count: number;
    last_completed_key: string;
  }>(
    'SELECT id, current_count, last_completed_key FROM streaks WHERE user_id = ? AND type = ?',
    [userId, type],
  );

  if (existing?.last_completed_key === currentKey) return;

  // Reject if the device clock appears to have been set backwards — ISO keys
  // are zero-padded and sort lexicographically, so a key that is less than
  // an already-recorded key means the clock has moved backward.
  if (existing && currentKey < existing.last_completed_key) return;

  const prevKey = getPreviousKey(type);
  const newCount =
    existing?.last_completed_key === prevKey ? existing.current_count + 1 : 1;

  await saveStreak(type, newCount, currentKey);
}
