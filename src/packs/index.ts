import { NativeModules } from 'react-native';
import { supabase } from '../supabase/client';
import introData from '../../packs/intro.json';
import fiveStar from '../../packs/1star-5x5.json';
import sixStar from '../../packs/1star-6x6.json';
import eightStar from '../../packs/1star-8x8.json';
import tenStar from '../../packs/2star-10x10.json';
import dailyData from '../../packs/daily.json';
import weeklyData from '../../packs/weekly.json';
import monthlyData from '../../packs/monthly.json';
import type { RawPuzzle, Pack } from '../types/puzzle';
import type { StreakType } from '../types/state';

import type * as RNFSType from 'react-native-fs';

function getRNFS(): typeof RNFSType | null {
  if (!NativeModules.RNFSManager) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-fs') as typeof RNFSType;
  } catch {
    return null;
  }
}

const BUNDLED_PACKS: Record<string, RawPuzzle[]> = {
  intro: (introData as unknown as Pack).puzzles,
  '1star-5x5': (fiveStar as unknown as Pack).puzzles,
  '1star-6x6': (sixStar as unknown as Pack).puzzles,
  '1star-8x8': (eightStar as unknown as Pack).puzzles,
  '2star-10x10': (tenStar as unknown as Pack).puzzles,
};

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

async function loadDownloadedPackPuzzles(
  packId: string,
): Promise<RawPuzzle[] | null> {
  try {
    const rnfs = getRNFS();
    if (!rnfs) return null;
    const path = `${rnfs.DocumentDirectoryPath}/packs/${packId}.json`;
    const exists = await rnfs.exists(path);
    if (!exists) return null;
    const raw = await rnfs.readFile(path, 'utf8');
    return (JSON.parse(raw) as { puzzles: RawPuzzle[] }).puzzles;
  } catch {
    return null;
  }
}

export async function getPuzzlesForPack(
  packId: string,
): Promise<RawPuzzle[] | null> {
  const downloaded = await loadDownloadedPackPuzzles(packId);
  if (downloaded) return downloaded;
  return BUNDLED_PACKS[packId] ?? null;
}

export async function refreshFreePacks(freePackIds: string[]): Promise<void> {
  const rnfs = getRNFS();
  if (!rnfs) return;
  const packDir = `${rnfs.DocumentDirectoryPath}/packs`;
  await rnfs.mkdir(packDir).catch(() => {});
  for (const packId of freePackIds) {
    try {
      const { data } = await supabase.storage
        .from('packs')
        .download(`${packId}.json`);
      if (!data) continue;
      const text = await (data as unknown as { text(): Promise<string> }).text();
      await rnfs.writeFile(`${packDir}/${packId}.json`, text, 'utf8');
    } catch {
      // Non-fatal: bundled fallback will be used
    }
  }
}

export async function downloadPaidPack(
  packId: string,
  storagePath: string,
): Promise<void> {
  const rnfs = getRNFS();
  if (!rnfs) throw new Error('File system unavailable — run pod install');
  const packDir = `${rnfs.DocumentDirectoryPath}/packs`;
  await rnfs.mkdir(packDir).catch(() => {});
  const { data } = await supabase.storage.from('packs').download(storagePath);
  if (!data) throw new Error(`Failed to download pack ${packId}`);
  const text = await (data as unknown as { text(): Promise<string> }).text();
  await rnfs.writeFile(`${packDir}/${packId}.json`, text, 'utf8');
}
