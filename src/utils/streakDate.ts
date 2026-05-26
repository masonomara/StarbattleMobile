import type { Streak, StreakType } from '../types';

export const STREAK_TYPES: StreakType[] = ['daily', 'weekly', 'monthly'];

export const STREAK_LABELS: Record<StreakType, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
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

export function getPuzzleIndex(
  type: StreakType,
  packSize: number,
  now = new Date(),
): number {
  const epoch = new Date(2025, 0, 1);
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
      const monthsSinceEpoch = (now.getFullYear() - 2025) * 12 + now.getMonth();
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
