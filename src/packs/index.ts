import { NativeModules } from 'react-native';
import { supabase } from '../supabase';
import type { RawPuzzle, Pack, StreakType } from '../types.ts';

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

function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

async function fetchFromSupabase(storageKey: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('packs')
    .download(storageKey);
  if (error) throw error;
  if (!data) throw new Error(`No data for ${storageKey}`);
  return blobToText(data);
}

async function loadPack(storageKey: string): Promise<string> {
  const rnfs = getRNFS();
  if (rnfs) {
    const packDir = `${rnfs.DocumentDirectoryPath}/packs`;
    await rnfs.mkdir(packDir).catch(() => {});
    const localPath = `${packDir}/${storageKey}`;
    try {
      if (await rnfs.exists(localPath)) {
        return rnfs.readFile(localPath, 'utf8');
      }
    } catch {
      /* fall through */
    }
    const text = await fetchFromSupabase(storageKey);
    await rnfs.writeFile(localPath, text, 'utf8').catch(() => {});
    return text;
  }
  return fetchFromSupabase(storageKey);
}

export async function getPuzzlesForPack(
  packId: string,
): Promise<RawPuzzle[] | null> {
  try {
    const text = await loadPack(`${packId}.json`);
    return (JSON.parse(text) as { puzzles: RawPuzzle[] }).puzzles;
  } catch (e) {
    console.error('[packs] getPuzzlesForPack failed:', packId, e);
    return null;
  }
}

export async function getStreakPack(type: StreakType): Promise<Pack | null> {
  try {
    const text = await loadPack(`${type}.json`);
    return JSON.parse(text) as Pack;
  } catch (e) {
    console.error('[packs] getStreakPack failed:', type, e);
    return null;
  }
}

export async function downloadPack(
  packId: string,
  storagePath: string,
): Promise<void> {
  const rnfs = getRNFS();
  if (!rnfs) throw new Error('File system unavailable — run pod install');
  const packDir = `${rnfs.DocumentDirectoryPath}/packs`;
  await rnfs.mkdir(packDir).catch(() => {});
  const { data, error } = await supabase.storage
    .from('packs')
    .download(storagePath);
  if (error) throw error;
  const text = await blobToText(data);
  await rnfs.writeFile(`${packDir}/${packId}.json`, text, 'utf8');
}
