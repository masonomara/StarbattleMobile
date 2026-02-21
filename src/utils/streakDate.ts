import type { StreakType, Streak } from '../types/streak';

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

export function getPuzzleIndex(type: StreakType, packSize: number, now = new Date()): number {
  const epoch = new Date('2025-01-01');
  const msPerDay = 86400000;
  const daysSinceEpoch = Math.floor((now.getTime() - epoch.getTime()) / msPerDay);

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
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

export function getActiveStreak(streak: Streak, type: StreakType): number {
  const currentKey = getCurrentKey(type);
  const prevKey = getPreviousKey(type);
  if (streak.lastCompletedKey === currentKey || streak.lastCompletedKey === prevKey) {
    return streak.current;
  }
  return 0;
}
