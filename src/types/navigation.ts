import type { StreakType } from './state';

export type RootStackParamList = {
  Home: undefined;
  Library: { packId: string };
  Puzzle:
    | { packId: string; puzzleIndex: number; streakType?: never }
    | {
        streakType: StreakType;
        isArchive?: boolean;
        archiveKey?: string;
        packId?: never;
        puzzleIndex?: never;
      };
  Streaks: undefined;
  Account: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
