import type { Streak, StreakType, StreakCell } from '../../types';

export const STREAK_TYPES: StreakType[] = ['daily', 'weekly', 'monthly'];

// A pack's `type` is dual-purpose: a StreakType marks a streak-carousel pack,
// while any other string is a library bundle name. This guard is the single
// source of truth for that distinction — only these three values are streaks.
export function isStreakType(value: string | undefined | null): value is StreakType {
  return value === 'daily' || value === 'weekly' || value === 'monthly';
}

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

// App launch date — archive only surfaces puzzles from this date onward.
export const RELEASE_DATE = new Date(2026, 3, 16); // April 16 2026

export function getPuzzleIndex(
  type: StreakType,
  packSize: number,
  now = new Date(),
): number {
  const epoch = RELEASE_DATE;
  const msPerDay = 86400000;
  const daysSinceEpoch = Math.floor(
    (now.getTime() - epoch.getTime()) / msPerDay,
  );

  // Euclidean modulo: JS `%` keeps the sign of the dividend, so a date before
  // RELEASE_DATE (negative elapsed time) would otherwise yield a negative,
  // out-of-bounds puzzle index.
  const mod = (n: number, m: number) => ((n % m) + m) % m;

  switch (type) {
    case 'daily':
      return mod(daysSinceEpoch, packSize);
    case 'weekly':
      return mod(Math.floor(daysSinceEpoch / 7), packSize);
    case 'monthly': {
      const monthsSinceEpoch =
        (now.getFullYear() - 2026) * 12 + (now.getMonth() - 3);
      return mod(monthsSinceEpoch, packSize);
    }
  }
}

// Returns the 7 daily date keys (Sunday → Saturday) for the calendar week
// containing `now`, each formatted like getCurrentKey('daily') ("YYYY-MM-DD").
// Drives the daily streak card's weekday progress row. Date arithmetic handles
// month/year rollover within the week automatically.
export function getWeekDateKeys(now = new Date()): string[] {
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay()); // getDay(): 0=Sun … 6=Sat
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    keys.push(`${y}-${m}-${day}`);
  }
  return keys;
}

// First letter of each month (Jan → "J" … Dec → "D"), index 0–11. Single
// letters intentionally repeat (M for March/May, J for June/July, etc.), the
// same way the daily row's weekday letters repeat S and T.
const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Streak progress cells for a cadence — the circles drawn under a streak card.
// Daily → 7 days of the current week; weekly → every week the current month
// touches (numbered 1…N); monthly → all 12 months of the current year.
export function getStreakCells(type: StreakType, now = new Date()): StreakCell[] {
  switch (type) {
    case 'daily':
      return getDayCells(now);
    case 'weekly':
      return getWeekCells(now);
    case 'monthly':
      return getMonthCells(now);
  }
}

// Daily: the seven days (Sun → Sat) of the current week, labeled S M T W T F S.
function getDayCells(now: Date): StreakCell[] {
  const keys = getWeekDateKeys(now);
  const todayKey = getCurrentKey('daily', now);
  return keys.map((key, i) => ({
    key,
    letter: WEEKDAY_LETTERS[i],
    isCurrent: key === todayKey,
  }));
}

// Weekly: one cell per Sunday-start week that the current month touches (the
// week of the 1st through the week of the last day — 4 to 6 weeks). The label
// is the week's ordinal within the displayed set (1…N) so the row reads
// 1 2 3 4 5 instead of a repeated month initial.
//
// The streak system keys weeks by ISO week (Mon–Sun), which is offset one day
// from these Sunday-start display weeks. Each display week overlaps one ISO week
// by six of its seven days; we key the cell off a midweek day (Wednesday) so it
// lands in that dominant ISO week and matches what getCurrentKey('weekly')
// stores. "Current" is decided by date containment, not key equality, so the
// highlight is always exact even on the Sunday boundary.
function getWeekCells(now: Date): StreakCell[] {
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastOfMonth = new Date(year, month + 1, 0);

  // Sunday on or before the 1st of the month.
  const weekStart = new Date(year, month, 1);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  // Sunday of the week containing today (for the isCurrent test).
  const todaySunday = new Date(year, month, now.getDate());
  todaySunday.setDate(todaySunday.getDate() - todaySunday.getDay());

  const cells: StreakCell[] = [];
  const cursor = new Date(weekStart);
  let weekNumber = 1;
  while (cursor <= lastOfMonth) {
    const midweek = new Date(cursor);
    midweek.setDate(cursor.getDate() + 3); // Wednesday — in the dominant ISO week
    cells.push({
      key: getCurrentKey('weekly', midweek),
      // Previous: month initial of the week's Sunday (e.g. M J J J J J).
      // letter: MONTH_LETTERS[cursor.getMonth()],
      letter: String(weekNumber),
      isCurrent: cursor.getTime() === todaySunday.getTime(),
    });
    cursor.setDate(cursor.getDate() + 7);
    weekNumber++;
  }
  return cells;
}

// Monthly: all 12 months of the current year, Jan → Dec, labeled J F M A M J J
// A S O N D with the current month highlighted.
function getMonthCells(now: Date): StreakCell[] {
  // Previous: only the three months of the current meteorological season —
  // winter (Dec–Feb), spring (Mar–May), summer (Jun–Aug), or fall (Sep–Nov).
  // Seasons start every 3 months from December, so the offset of the current
  // month within its season is its distance (mod 3) from the most recent
  // December. Subtracting that offset gives the season's first month; Date
  // normalizes the rollover so a January/February current month correctly
  // reaches the previous year's December.
  // const monthsSinceDecember = (now.getMonth() - 11 + 12) % 12;
  // const offsetInSeason = monthsSinceDecember % 3;
  // const seasonStart = new Date(now.getFullYear(), now.getMonth() - offsetInSeason, 1);
  // const cells: StreakCell[] = [];
  // for (let i = 0; i < 3; i++) {
  //   const monthDate = new Date(
  //     seasonStart.getFullYear(),
  //     seasonStart.getMonth() + i,
  //     1,
  //   );
  //   cells.push({
  //     key: getCurrentKey('monthly', monthDate),
  //     letter: MONTH_LETTERS[monthDate.getMonth()],
  //     isCurrent:
  //       monthDate.getFullYear() === now.getFullYear() &&
  //       monthDate.getMonth() === now.getMonth(),
  //   });
  // }
  // return cells;

  const cells: StreakCell[] = [];
  for (let i = 0; i < 12; i++) {
    const monthDate = new Date(now.getFullYear(), i, 1);
    cells.push({
      key: getCurrentKey('monthly', monthDate),
      letter: MONTH_LETTERS[i],
      isCurrent: i === now.getMonth(),
    });
  }
  return cells;
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
