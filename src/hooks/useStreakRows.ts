import { useQuery } from '@powersync/react-native';
import type { Streak } from '../types';

const STREAKS_QUERY =
  'SELECT type, current_count, best_count, last_completed_key FROM streaks WHERE user_id = ?';

type StreakRow = {
  type: string;
  current_count: number;
  best_count: number;
  last_completed_key: string;
};

function rowsToStreaks(rows: readonly StreakRow[]): Streak[] {
  return rows.map(r => ({
    type: r.type as Streak['type'],
    current: r.current_count,
    best: r.best_count,
    lastCompletedKey: r.last_completed_key,
  }));
}

// Subscribes to the current user's streak rows via PowerSync's live query.
// The rowComparator runs an incremental (differential) watch: it only re-emits
// when the result set actually changes and preserves references for unchanged
// rows, so unrelated writes don't churn consumers.
//
// isLoading reflects only the query itself. Callers that care about the
// no-signed-in-user state (e.g. the screen-reveal gate) handle it explicitly
// rather than having that policy baked into this hook.
export function useStreakRows(
  userId: string | undefined,
): { streaks: Streak[]; isLoading: boolean } {
  const { data, isLoading } = useQuery<StreakRow>(
    STREAKS_QUERY,
    [userId ?? ''],
    {
      rowComparator: {
        keyBy: r => r.type,
        compareBy: r =>
          `${r.current_count}:${r.best_count}:${r.last_completed_key}`,
      },
    },
  );
  return { streaks: rowsToStreaks(data), isLoading };
}
