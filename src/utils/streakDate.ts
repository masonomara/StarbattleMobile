import type { Streak, StreakType } from '../types';

export const STREAK_TYPES: StreakType[] = ['daily', 'weekly', 'monthly'];

export const STREAK_LABELS: Record<StreakType, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export const STREAK_UNIT: Record<StreakType, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
};

export function getCurrentKey(type: StreakType, now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');

  switch (type) {
    case 'daily':
      return `${y}-${m}-${d}`;
    case 'weekly':
      return `${y}-W${String(getISOWeek(now)).padStart(2, '0')}`;
    case 'monthly':
      return `${y}-${m}`;
  }
}

export function getPreviousKey(type: StreakType, now = new Date()): string {
  const prev = new Date(now);
  switch (type) {
    case 'daily':
      prev.setDate(prev.getDate() - 1);
      break;
    case 'weekly':
      prev.setDate(prev.getDate() - 7);
      break;
    case 'monthly':
      prev.setMonth(prev.getMonth() - 1);
      break;
  }
  return getCurrentKey(type, prev);
}

// NOTE: getPuzzleIndex is the core deterministic "which puzzle plays today"
// function. The hardcoded epoch (April 16 2026) must match RELEASE_DATE below —
// they are currently separate constants. If the release date ever changes,
// both must be updated together. Consider deriving epoch from RELEASE_DATE to
// eliminate the duplication and the risk of them drifting apart.
export function getPuzzleIndex(
  type: StreakType,
  packSize: number,
  now = new Date(),
): number {
  const epoch = new Date(2026, 3, 16); // April 16 2026
  const msPerDay = 86400000;
  const daysSinceEpoch = Math.floor(
    (now.getTime() - epoch.getTime()) / msPerDay,
  );

  switch (type) {
    case 'daily':
      return daysSinceEpoch % packSize;
    case 'weekly':
      return Math.floor(daysSinceEpoch / 7) % packSize;
    case 'monthly': {
      const monthsSinceEpoch =
        (now.getFullYear() - 2026) * 12 + (now.getMonth() - 3);
      return monthsSinceEpoch % packSize;
    }
  }
}

function getISOWeek(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    )
  );
}

export function archiveKeyToDate(type: StreakType, key: string): Date {
  switch (type) {
    case 'daily': {
      const [y, m, d] = key.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    case 'weekly': {
      const [yearStr, weekStr] = key.split('-W');
      const year = Number(yearStr);
      const week = Number(weekStr);
      const jan4 = new Date(year, 0, 4);
      const isoDay = jan4.getDay() || 7;
      const firstMonday = new Date(jan4);
      firstMonday.setDate(jan4.getDate() - (isoDay - 1) + (week - 1) * 7);
      return firstMonday;
    }
    case 'monthly': {
      const [yearStr, monthStr] = key.split('-');
      return new Date(Number(yearStr), Number(monthStr) - 1, 1);
    }
  }
}

// App launch date — archive only surfaces puzzles from this date onward.
// DEBT: This constant and the epoch inside getPuzzleIndex represent the same date.
// Unify them: use RELEASE_DATE as the epoch in getPuzzleIndex to keep a single
// source of truth.
const RELEASE_DATE = new Date(2026, 3, 16); // April 16 2026

export function getPastDateKeys(type: StreakType, now = new Date()): string[] {
  const msPerDay = 86400000;
  const releaseYear = RELEASE_DATE.getFullYear();
  const releaseMonth = RELEASE_DATE.getMonth();
  const keys: string[] = [];

  switch (type) {
    case 'daily': {
      // Exclude today — only show dates that have fully passed.
      const daysElapsed = Math.floor(
        (now.getTime() - RELEASE_DATE.getTime()) / msPerDay,
      );
      for (let i = 0; i < daysElapsed; i++) {
        const d = new Date(RELEASE_DATE.getTime() + i * msPerDay);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        keys.push(`${y}-${m}-${day}`);
      }
      break;
    }
    case 'weekly': {
      // Exclude the current week — only show weeks that have fully ended.
      const currentKey = getCurrentKey('weekly', now);
      let d = new Date(RELEASE_DATE);
      while (getCurrentKey('weekly', d) < currentKey) {
        keys.push(getCurrentKey('weekly', d));
        d = new Date(d.getTime() + 7 * msPerDay);
      }
      break;
    }
    case 'monthly': {
      // Exclude the current month — only show months that have fully ended.
      const monthsElapsed =
        (now.getFullYear() - releaseYear) * 12 +
        (now.getMonth() - releaseMonth);
      for (let i = 0; i < monthsElapsed; i++) {
        keys.push(getCurrentKey('monthly', new Date(releaseYear, releaseMonth + i, 1)));
      }
      break;
    }
  }

  return keys.reverse();
}

export function formatArchiveKey(type: StreakType, key: string): string {
  switch (type) {
    case 'daily': {
      const [y, m, d] = key.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
    case 'weekly': {
      const [yearStr, weekStr] = key.split('-W');
      return `Week ${Number(weekStr)}, ${yearStr}`;
    }
    case 'monthly': {
      const [yearStr, monthStr] = key.split('-');
      return new Date(Number(yearStr), Number(monthStr) - 1, 1).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
    }
  }
}

export function getActiveStreak(streak: Streak, type: StreakType): number {
  const currentKey = getCurrentKey(type);
  const prevKey = getPreviousKey(type);
  if (
    streak.lastCompletedKey === currentKey ||
    streak.lastCompletedKey === prevKey
  ) {
    return streak.current;
  }
  return 0;
}
