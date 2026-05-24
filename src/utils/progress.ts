import { db } from '../powersync/AppSchema';
import { useAuthStore } from '../stores/authStore';
import { getCurrentKey, getPreviousKey } from './streakDate';
import type { CellValue, StreakType, Streak } from '../types.ts';

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

  const existing = await db.getOptional<{ id: string; completed_at: string | null }>(
    'SELECT id, completed_at FROM puzzle_progress WHERE user_id = ? AND puzzle_id = ?',
    [userId, puzzleId],
  );

  if (existing) {
    await db.execute(
      `UPDATE puzzle_progress SET
         cells = ?, auto_marks = ?, time_ms = ?, completed = ?,
         completed_at = COALESCE(completed_at, ?), updated_at = ?
       WHERE id = ?`,
      [
        JSON.stringify(cells),
        JSON.stringify([...autoMarks]),
        timeMs,
        completed ? 1 : 0,
        completed ? now : null,
        now,
        existing.id,
      ],
    );
  } else {
    await db.execute(
      `INSERT INTO puzzle_progress
         (id, user_id, puzzle_id, cells, auto_marks, time_ms, completed, completed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
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

export async function getCompletedPuzzleIdsForPack(
  packId: string,
  puzzleCount: number,
): Promise<Set<string>> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return new Set();

  const ids = Array.from({ length: puzzleCount }, (_, i) => `${packId}:${i}`);
  const placeholders = ids.map(() => '?').join(',');

  const rows = await db.getAll<{ puzzle_id: string }>(
    `SELECT puzzle_id FROM puzzle_progress
     WHERE user_id = ? AND puzzle_id IN (${placeholders}) AND completed = 1`,
    [userId, ...ids],
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

  const existing = await db.getOptional<{ id: string }>(
    'SELECT id FROM streaks WHERE user_id = ? AND type = ?',
    [userId, type],
  );

  if (existing) {
    await db.execute(
      'UPDATE streaks SET current_count = ?, last_completed_key = ?, updated_at = ? WHERE id = ?',
      [currentCount, lastCompletedKey, now, existing.id],
    );
  } else {
    await db.execute(
      `INSERT INTO streaks (id, user_id, type, current_count, last_completed_key, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [`${userId}:${type}`, userId, type, currentCount, lastCompletedKey, now],
    );
  }
}

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

  const prevKey = getPreviousKey(type);
  const newCount =
    existing?.last_completed_key === prevKey ? existing.current_count + 1 : 1;

  await saveStreak(type, newCount, currentKey);
}
