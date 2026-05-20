import { db } from '../powersync/database';
import { useAuthStore } from '../stores/authStore';
import type { CellValue } from '../types/state';

function rowId(userId: string, puzzleId: string): string {
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
  { type: string; currentCount: number; lastCompletedKey: string }[]
> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return [];

  return db.getAll(
    'SELECT type, current_count as currentCount, last_completed_key as lastCompletedKey FROM streaks WHERE user_id = ?',
    [userId],
  );
}
