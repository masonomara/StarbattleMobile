import { NativeModules } from 'react-native';
import { supabase } from '../supabase/client';
import type { RawPuzzle } from '../types/puzzle';

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

function getPackDir(): string | null {
  const rnfs = getRNFS();
  return rnfs ? `${rnfs.DocumentDirectoryPath}/packs` : null;
}

export async function downloadPack(
  packId: string,
  storagePath: string,
): Promise<void> {
  const rnfs = getRNFS();
  const packDir = getPackDir();
  if (!rnfs || !packDir) throw new Error('File system unavailable — run pod install');
  await rnfs.mkdir(packDir).catch(() => {});
  const { data, error } = await supabase.storage
    .from('packs')
    .download(storagePath);
  if (error) throw error;
  const text = await (data as unknown as { text(): Promise<string> }).text();
  await rnfs.writeFile(`${packDir}/${packId}.json`, text, 'utf8');
}

export async function isPackDownloaded(packId: string): Promise<boolean> {
  try {
    const rnfs = getRNFS();
    const packDir = getPackDir();
    if (!rnfs || !packDir) return false;
    return await rnfs.exists(`${packDir}/${packId}.json`);
  } catch {
    return false;
  }
}

export async function loadDownloadedPack(
  packId: string,
): Promise<RawPuzzle[] | null> {
  try {
    const rnfs = getRNFS();
    const packDir = getPackDir();
    if (!rnfs || !packDir) return null;
    const path = `${packDir}/${packId}.json`;
    const exists = await rnfs.exists(path);
    if (!exists) return null;
    const raw = await rnfs.readFile(path, 'utf8');
    return (JSON.parse(raw) as { puzzles: RawPuzzle[] }).puzzles;
  } catch {
    return null;
  }
}
