import type { RawPuzzle } from '../types/puzzle';

// stub — implement after: npm install react-native-fs && cd ios && pod install
export async function downloadPack(_packId: string): Promise<void> {}

export async function loadDownloadedPack(
  _packId: string,
): Promise<RawPuzzle[] | null> {
  return null;
}

export async function isPackDownloaded(_packId: string): Promise<boolean> {
  return false;
}
