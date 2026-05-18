import type { RawPuzzle } from '../types/puzzle';

export async function loadDownloadedPack(
  _packId: string,
): Promise<RawPuzzle[] | null> {
  return null;
}

export async function isPackDownloaded(_packId: string): Promise<boolean> {
  return false;
}
