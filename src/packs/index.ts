import { NativeModules } from 'react-native';
import { supabase } from '../supabase';
import { packMetaStorage } from '../mmkv';
import type { RawPuzzle, Pack, StreakType, HintStep } from '../types';

const PACK_MIN_VERSION = 2;

import type * as RNFSType from 'react-native-fs';

function getRNFS(): typeof RNFSType | null {
  if (!NativeModules.RNFSManager) return null;
  try {
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

// Verify that downloaded JSON has the expected pack structure.
// Throws on malformed or tampered content before it is cached or parsed.
function validatePackText(text: string): void {
  const data = JSON.parse(text) as { puzzles?: unknown };
  if (!Array.isArray(data?.puzzles) || data.puzzles.length === 0) {
    throw new Error('Invalid pack: missing puzzles');
  }
  for (const p of data.puzzles as Array<{ sbn?: unknown }>) {
    if (typeof p?.sbn !== 'string' || !/^\d+x\d+\./.test(p.sbn)) {
      throw new Error('Invalid pack: malformed puzzle SBN');
    }
  }
}

function encodeForDisk(text: string): string {
  return text;
}

function decodeFromDisk(text: string): Pack {
  return JSON.parse(text) as Pack;
}

function assertSafeKey(key: string): void {
  if (/[/\\]/.test(key) || key.includes('..')) {
    throw new Error(`Unsafe pack key: ${key}`);
  }
}

function getCachedEtag(key: string): string | undefined {
  return packMetaStorage.getString(`etag:${key}`) ?? undefined;
}

function setCachedEtag(key: string, etag: string): void {
  packMetaStorage.set(`etag:${key}`, etag);
}

async function fetchFromSupabase(storageKey: string): Promise<string> {
  console.log(`[SB:PACK] supabase.storage.from('packs').download('${storageKey}')`);
  const { data, error } = await supabase.storage
    .from('packs')
    .download(storageKey);
  if (error) throw error;
  if (!data) throw new Error(`No data for ${storageKey}`);
  return blobToText(data);
}

// localKey = disk filename (e.g. "pack-id.json")
// remoteKey = Supabase storage path; defaults to localKey when omitted
async function fetchPack(localKey: string, remoteKey?: string): Promise<Pack> {
  assertSafeKey(localKey);
  const effectiveRemoteKey = remoteKey ?? localKey;
  const rnfs = getRNFS();
  if (rnfs) {
    const localPath = `${rnfs.DocumentDirectoryPath}/packs/${localKey}`;
    try {
      const raw = await rnfs.readFile(localPath, 'utf8');
      const pack = decodeFromDisk(raw);
      console.log(`[SB:PACK] ${localKey}: ${(raw.length / 1024).toFixed(1)} KB, ${pack.puzzles?.length ?? '?'} puzzles`);
      if (pack.version < PACK_MIN_VERSION) {
        await rnfs.unlink(localPath).catch(() => {});
        packMetaStorage.remove(`etag:${localKey}`);
        throw new Error(`stale pack evicted: ${localKey}`);
      }
      return pack;
    } catch {
      // not on disk yet — fall through to network
    }
    const text = await fetchFromSupabase(effectiveRemoteKey);
    validatePackText(text);
    await rnfs.mkdir(`${rnfs.DocumentDirectoryPath}/packs`).catch(() => {});
    await rnfs
      .writeFile(localPath, encodeForDisk(text), 'utf8')
      .catch(() => {});
    const downloaded = JSON.parse(text) as Pack;
    console.log(`[SB:PACK] ${localKey} downloaded — v${downloaded.version}, ${downloaded.puzzles?.length} puzzles, keys: ${Object.keys(downloaded.puzzles?.[0] ?? {}).join(',')}`);
    return downloaded;
  }
  return fetchFromSupabase(effectiveRemoteKey).then(text => JSON.parse(text) as Pack);
}

// In-memory cache keyed by local filename. Stores the in-flight or resolved
// Promise so concurrent callers for the same key share one fetch.
const packCache = new Map<string, Promise<Pack>>();

function loadPack(localKey: string, remoteKey?: string): Promise<Pack> {
  const cached = packCache.get(localKey);
  if (cached) return cached;

  const promise = fetchPack(localKey, remoteKey);
  packCache.set(localKey, promise);
  // Evict on failure so the next call retries rather than re-throwing instantly.
  promise.catch(() => packCache.delete(localKey));
  // Pre-warm the hints cache in parallel — preview packs have no hints file.
  if (!localKey.includes('_preview')) {
    const hintId = localKey.replace(/\.json$/, '');
    console.log(`[SB:HINTS] loadPack side-effect: loadPackHints(${hintId})`);
    loadPackHints(hintId).catch(e => console.error(`[SB:HINTS] side-effect failed for ${hintId}:`, e));
  }
  return promise;
}

// In-memory cache for hint arrays, keyed by packId (not filename).
// Separate from packCache so evicting a stale pack doesn't discard hints.
const hintsCache = new Map<string, Promise<HintStep[][]>>();

async function fetchPackHints(packId: string): Promise<HintStep[][]> {
  const storageKey = `${packId}-hints.json`;
  console.log(`[SB:HINTS] fetching ${storageKey}`);
  try {
    const text = await Promise.race([
      fetchFromSupabase(storageKey),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('hints fetch timeout')), 10_000),
      ),
    ]);
    const hints = (JSON.parse(text) as { hints: HintStep[][] }).hints;
    console.log(`[SB:HINTS] ${packId}: ${(text.length / 1024).toFixed(1)} KB, ${hints.length} entries`);
    return hints;
  } catch (e) {
    console.error(`[SB:HINTS] ${packId} fetch failed:`, e);
    throw e;
  }
}

export function loadPackHints(packId: string): Promise<HintStep[][]> {
  const cached = hintsCache.get(packId);
  if (cached) {
    console.log(`[SB:HINTS] ${packId}: cache hit`);
    return cached;
  }
  console.log(`[SB:HINTS] ${packId}: cache miss — starting fetch`);
  const promise = fetchPackHints(packId);
  hintsCache.set(packId, promise);
  promise.catch(() => hintsCache.delete(packId));
  return promise;
}

export function prefetchHintsFile(packId: string): Promise<void> {
  return loadPackHints(packId).then(() => {}).catch(() => {});
}

const PREVIEW_PUZZLE_COUNT = 1;

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

export async function getStreakPack(type: StreakType): Promise<Pack | null> {
  try {
    return await loadPack(`${type}.json`);
  } catch (e) {
    console.error('[SB:PACK] getStreakPack failed:', type, e);
    return null;
  }
}

// Removes pack files from the local disk cache that haven't been accessed in
// more than 90 days. Streak files are never purged — they're small and always
// needed. Safe to call fire-and-forget on app startup.
export async function purgeStalePacks(): Promise<void> {
  const rnfs = getRNFS();
  if (!rnfs) return;

  const packDir = `${rnfs.DocumentDirectoryPath}/packs`;
  const files = await rnfs.readdir(packDir).catch(() => [] as string[]);
  const cutoffMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const STREAK_FILES = new Set(['daily.json', 'weekly.json', 'monthly.json']);

  for (const file of files) {
    if (STREAK_FILES.has(file)) continue;
    const path = `${packDir}/${file}`;
    try {
      const stat = await rnfs.stat(path);
      if (new Date(stat.mtime).getTime() < cutoffMs) {
        await rnfs.unlink(path);
        packMetaStorage.remove(`etag:${file}`);
      }
    } catch {
      // Skip files we can't stat or delete.
    }
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
  const { data, error } = await supabase.storage
    .from('packs')
    .download(storagePath);
  if (error) throw error;
  const text = await blobToText(data);
  validatePackText(text);
  await rnfs.writeFile(
    `${packDir}/${packId}.json`,
    encodeForDisk(text),
    'utf8',
  );
  // Warm the cache with the parsed (decoded) content.
  packCache.set(`${packId}.json`, Promise.resolve(JSON.parse(text) as Pack));
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
  } else if (packCache.has(`${packId}.json`)) {
    return; // in-memory only environment, already cached
  }

  let remoteEtag: string | undefined;
  try {
    const { data, error } = await supabase.storage.from('packs').info(storagePath);
    if (error) return; // network unavailable
    remoteEtag = data?.etag ?? undefined;
    if (alreadyOnDisk && remoteEtag && remoteEtag === getCachedEtag(storagePath)) return;
  } catch {
    return;
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

  packCache.set(`${packId}.json`, Promise.resolve(JSON.parse(text) as Pack));
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
  } else if (packCache.has(`${packId}.json`)) {
    return;
  }

  const previewEtagKey = `preview:${storagePath}`;
  let remoteEtag: string | undefined;
  try {
    const { data, error } = await supabase.storage.from('packs').info(storagePath);
    if (error) return;
    remoteEtag = data?.etag ?? undefined;
    if (rnfs) {
      try {
        await rnfs.stat(`${rnfs.DocumentDirectoryPath}/packs/${packId}_preview.json`);
        // Preview on disk — skip if ETag matches
        if (remoteEtag && remoteEtag === getCachedEtag(previewEtagKey)) return;
      } catch {
        // preview not on disk
      }
    } else if (packCache.has(`${packId}_preview.json`)) {
      if (remoteEtag && remoteEtag === getCachedEtag(previewEtagKey)) return;
    }
  } catch {
    return;
  }

  let text: string;
  try {
    text = await fetchFromSupabase(storagePath);
    validatePackText(text);
  } catch {
    return;
  }

  const parsed = JSON.parse(text) as { puzzles: RawPuzzle[] };
  const previewData = { puzzles: parsed.puzzles.slice(0, PREVIEW_PUZZLE_COUNT) };
  const previewText = JSON.stringify(previewData);

  if (rnfs) {
    const packDir = `${rnfs.DocumentDirectoryPath}/packs`;
    await rnfs.mkdir(packDir).catch(() => {});
    await rnfs
      .writeFile(`${packDir}/${packId}_preview.json`, encodeForDisk(previewText), 'utf8')
      .catch(() => {});
  }

  packCache.set(`${packId}_preview.json`, Promise.resolve(JSON.parse(previewText) as Pack));
  if (remoteEtag) setCachedEtag(previewEtagKey, remoteEtag);
}
