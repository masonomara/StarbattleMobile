import { NativeModules } from 'react-native';
import { supabase } from '../supabase/client';
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
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(data);
  });
  await rnfs.writeFile(`${packDir}/${packId}.json`, text, 'utf8');
}

