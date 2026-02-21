export type StreakType = 'daily' | 'weekly' | 'monthly';

export type Streak = {
  current: number;
  lastCompletedKey: string;
};
