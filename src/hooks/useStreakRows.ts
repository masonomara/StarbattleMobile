import { useState, useEffect } from 'react';
import { db } from '../powersync/AppSchema';
import type { Streak } from '../types';

const STREAKS_QUERY =
  'SELECT type, current_count, last_completed_key FROM streaks WHERE user_id = ?';

type StreakRow = {
  type: string;
  current_count: number;
  last_completed_key: string;
};

function rowsToStreaks(rows: StreakRow[]): Streak[] {
  return rows.map(r => ({
    type: r.type as Streak['type'],
    current: r.current_count,
    lastCompletedKey: r.last_completed_key,
  }));
}

// Subscribes to the streaks table for the current user via PowerSync's live
// query. Updates reactively as data syncs — no manual refresh needed.
//
// NOTE: The initial db.getAll() fires immediately before db.watch() starts.
// db.watch() typically also fires with initial results shortly after, causing
// two renders on mount. This is intentional — the initial load eliminates the
// empty-flash window while the watcher initialises. If PowerSync's watch API
// adds a synchronous initial-result option in future, the getAll() can be removed.
//
export function useStreakRows(
  userId: string | undefined,
): { streaks: Streak[]; isLoading: boolean } {
  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    // Initial load so there's no empty flash before the watcher fires.
    // isLoading clears once this resolves — the live watch never resets it.
    db.getAll<StreakRow>(STREAKS_QUERY, [userId])
      .then(rows => setStreaks(rowsToStreaks(rows)))
      .catch(() => {})
      .finally(() => setIsLoading(false));

    const controller = new AbortController();
    db.watch(
      STREAKS_QUERY,
      [userId],
      {
        onResult: result =>
          setStreaks(rowsToStreaks(result.rows?._array ?? [])),
      },
      { signal: controller.signal },
    );
    return () => controller.abort();
  }, [userId]);

  return { streaks, isLoading };
}
