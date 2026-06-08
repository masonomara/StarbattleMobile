import type { RawPuzzle, Pack, StreakType, HintsFile } from '../types';
import { getRNFS, assertSafeKey, encodeForDisk } from './packStorage';
import {
  fetchFromSupabase,
  validatePackText,
  validateHintsText,
  fetchPackEtag,
  getCachedEtag,
  setCachedEtag,
} from './packFetcher';
import {
  loadPack,
  warmPackCache,
  hasPackCacheEntry,
  warmHintsCache,
  hasHintsCacheEntry,
} from './packCache';

const PREVIEW_PUZZLE_COUNT = 1;

// ETag-aware background prefetch of "{packId}-hints.json" to disk; mirrors
// prefetchPackFile.
export async function prefetchHintsFile(packId: string): Promise<void> {
  assertSafeKey(packId);
  const key = `${packId}-hints.json`;
  const rnfs = getRNFS();

  let alreadyOnDisk = false;
  if (rnfs) {
    try {
      await rnfs.stat(`${rnfs.DocumentDirectoryPath}/packs/${key}`);
      alreadyOnDisk = true;
    } catch {
      // not on disk
    }
  } else if (hasHintsCacheEntry(packId)) {
    return;
  }

  let remoteEtag: string | undefined;
  try {
    remoteEtag = await fetchPackEtag(key);
    if (alreadyOnDisk && remoteEtag && remoteEtag === getCachedEtag(key)) return;
  } catch {
    return;
  }

  let text: string;
  try {
    text = await fetchFromSupabase(key);
    validateHintsText(text);
  } catch {
    return;
  }

  if (rnfs) {
    const packDir = `${rnfs.DocumentDirectoryPath}/packs`;
    await rnfs.mkdir(packDir).catch(() => {});
    await rnfs
      .writeFile(`${packDir}/${key}`, encodeForDisk(text), 'utf8')
      .catch(() => {});
  }

  warmHintsCache(packId, (JSON.parse(text) as HintsFile).hints);
  if (remoteEtag) setCachedEtag(key, remoteEtag);
}

export async function getPuzzlesForPack(
  packId: string,
  storagePath?: string,
): Promise<RawPuzzle[] | null> {
  const localKey = `${packId}.json`;
  const previewKey = `${packId}_preview.json`;
  const remoteKey = storagePath ?? localKey;
  try {
    const pack = await loadPack(localKey, remoteKey);
    return pack.puzzles;
  } catch {
    // Full pack unavailable — try preview
  }
  try {
    const preview = await loadPack(previewKey);
    return preview.puzzles;
  } catch (e) {
    console.error('[SB:PACK] getPuzzlesForPack failed:', packId, e);
    return null;
  }
}

// True if the pack file is already available locally (in-memory cache or on
// disk) — without triggering a network fetch. Used to decide whether the slim
// preview exists before reaching for it, so we never pay a doomed round-trip.
async function hasLocalPack(key: string): Promise<boolean> {
  if (hasPackCacheEntry(key)) return true;
  const rnfs = getRNFS();
  if (!rnfs) return false;
  try {
    await rnfs.stat(`${rnfs.DocumentDirectoryPath}/packs/${key}`);
    return true;
  } catch {
    return false;
  }
}

// Loads just the first puzzle for a library pack's home thumbnail. Prefers the
// slim "{packId}_preview.json" (one puzzle) so we don't download/parse the full
// pack — which matters most for unpurchased paid packs, where loadPack() would
// otherwise pull the entire pack down. The slim file is a local-only artifact
// (cachePackPreview writes it; it 404s on the network), so we only read it when
// it already exists locally, and fall back to the full pack otherwise.
export async function getPackPreview(
  packId: string,
  storagePath?: string,
): Promise<RawPuzzle | null> {
  const previewKey = `${packId}_preview.json`;
  if (await hasLocalPack(previewKey)) {
    try {
      const preview = await loadPack(previewKey);
      if (preview.puzzles.length) return preview.puzzles[0];
    } catch {
      // Slim preview unreadable — fall back to the full pack below.
    }
  }
  const puzzles = await getPuzzlesForPack(packId, storagePath);
  return puzzles?.[0] ?? null;
}

export async function getStreakPack(type: StreakType): Promise<Pack | null> {
  try {
    return await loadPack(`${type}.json`);
  } catch (e) {
    console.error('[SB:PACK] getStreakPack failed:', type, e);
    return null;
  }
}

export async function downloadPack(
  packId: string,
  storagePath: string,
): Promise<void> {
  assertSafeKey(packId);
  const rnfs = getRNFS();
  if (!rnfs)
    throw new Error(
      'File system unavailable. Please restart the app or reinstall.',
    );
  const packDir = `${rnfs.DocumentDirectoryPath}/packs`;
  await rnfs.mkdir(packDir).catch(() => {});
  const text = await fetchFromSupabase(storagePath);
  validatePackText(text);
  await rnfs.writeFile(
    `${packDir}/${packId}.json`,
    encodeForDisk(text),
    'utf8',
  );
  warmPackCache(`${packId}.json`, JSON.parse(text) as Pack);
}

// ETag-aware download for a regular pack. Uses storagePath for the Supabase
// key; saves to {packId}.json locally. Skips when:
//   - the file is already on disk AND the remote ETag matches the cached ETag
// Always downloads when the file is missing from disk, regardless of ETag.
export async function prefetchPackFile(
  packId: string,
  storagePath: string,
): Promise<void> {
  assertSafeKey(packId);
  const rnfs = getRNFS();

  let alreadyOnDisk = false;
  if (rnfs) {
    try {
      await rnfs.stat(`${rnfs.DocumentDirectoryPath}/packs/${packId}.json`);
      alreadyOnDisk = true;
    } catch {
      // not on disk
    }
  } else if (hasPackCacheEntry(`${packId}.json`)) {
    return; // in-memory only environment, already cached
  }

  let remoteEtag: string | undefined;
  try {
    remoteEtag = await fetchPackEtag(storagePath);
    if (
      alreadyOnDisk &&
      remoteEtag &&
      remoteEtag === getCachedEtag(storagePath)
    )
      return;
  } catch {
    return; // network unavailable
  }

  let text: string;
  try {
    text = await fetchFromSupabase(storagePath);
    validatePackText(text);
  } catch {
    return;
  }

  if (rnfs) {
    const packDir = `${rnfs.DocumentDirectoryPath}/packs`;
    await rnfs.mkdir(packDir).catch(() => {});
    await rnfs
      .writeFile(`${packDir}/${packId}.json`, encodeForDisk(text), 'utf8')
      .catch(() => {});
  }

  warmPackCache(`${packId}.json`, JSON.parse(text) as Pack);
  if (remoteEtag) setCachedEtag(storagePath, remoteEtag);
}

// Downloads a pack's full JSON and persists only the first PREVIEW_PUZZLE_COUNT
// puzzles to disk as {packId}_preview.json. Skips if the full pack already
// exists on disk (no need for a partial copy).
export async function cachePackPreview(
  packId: string,
  storagePath: string,
): Promise<void> {
  assertSafeKey(packId);
  const rnfs = getRNFS();

  if (rnfs) {
    // Skip if full pack already on disk — getPuzzlesForPack will use it.
    try {
      await rnfs.stat(`${rnfs.DocumentDirectoryPath}/packs/${packId}.json`);
      return;
    } catch {
      // full pack not on disk — continue
    }
  } else if (hasPackCacheEntry(`${packId}.json`)) {
    return;
  }

  const previewEtagKey = `preview:${storagePath}`;
  let remoteEtag: string | undefined;
  try {
    remoteEtag = await fetchPackEtag(storagePath);
    if (rnfs) {
      try {
        await rnfs.stat(
          `${rnfs.DocumentDirectoryPath}/packs/${packId}_preview.json`,
        );
        // Preview on disk — skip if ETag matches
        if (remoteEtag && remoteEtag === getCachedEtag(previewEtagKey)) return;
      } catch {
        // preview not on disk
      }
    } else if (hasPackCacheEntry(`${packId}_preview.json`)) {
      if (remoteEtag && remoteEtag === getCachedEtag(previewEtagKey)) return;
    }
  } catch {
    return; // network unavailable
  }

  let text: string;
  try {
    text = await fetchFromSupabase(storagePath);
    validatePackText(text);
  } catch {
    return;
  }

  const parsed = JSON.parse(text) as { puzzles: RawPuzzle[] };
  const previewData = {
    puzzles: parsed.puzzles.slice(0, PREVIEW_PUZZLE_COUNT),
  };
  const previewText = JSON.stringify(previewData);

  if (rnfs) {
    const packDir = `${rnfs.DocumentDirectoryPath}/packs`;
    await rnfs.mkdir(packDir).catch(() => {});
    await rnfs
      .writeFile(
        `${packDir}/${packId}_preview.json`,
        encodeForDisk(previewText),
        'utf8',
      )
      .catch(() => {});
  }

  warmPackCache(`${packId}_preview.json`, JSON.parse(previewText) as Pack);
  if (remoteEtag) setCachedEtag(previewEtagKey, remoteEtag);
}
