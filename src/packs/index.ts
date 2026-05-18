import introData from '../../packs/intro.json';
import fiveStar from '../../packs/1star-5x5.json';
import sixStar from '../../packs/1star-6x6.json';
import eightStar from '../../packs/1star-8x8.json';
import tenStar from '../../packs/2star-10x10.json';
import dailyData from '../../packs/daily.json';
import weeklyData from '../../packs/weekly.json';
import monthlyData from '../../packs/monthly.json';
import type { Pack } from '../types/puzzle';
import type { StreakType } from '../types/state';

export const packs: Pack[] = [
  introData as unknown as Pack,
  fiveStar as unknown as Pack,
  sixStar as unknown as Pack,
  eightStar as unknown as Pack,
  tenStar as unknown as Pack,
];

export const streakPacks: Record<StreakType, Pack> = {
  daily: dailyData as unknown as Pack,
  weekly: weeklyData as unknown as Pack,
  monthly: monthlyData as unknown as Pack,
};
