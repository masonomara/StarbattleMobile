import { supabase } from '../shared/lib/supabase';
import { packMetaStorage } from '../shared/lib/mmkv';
import type { Pack, HintStep, HintsFile } from '../types';
import {
  getRNFS,
  assertSafeKey,
  encodeForDisk,
  decodeFromDisk,
  decodeHintsFromDisk,
} from './packStorage';

// Packs below this version use a format that the parser no longer supports.
// On first load, stale packs are evicted from disk and re-fetched.
const PACK_MIN_VERSION = 2;

function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

// Verify that downloaded JSON has the expected pack structure, returning the
// parsed pack so callers don't have to JSON.parse the same text a second time.
// Throws on malformed or tampered content before it is cached or parsed.
export function validatePackText(text: string): Pack {
  const data = JSON.parse(text) as { puzzles?: unknown; version?: unknown };
  // Reject stale formats before caching, so a v1 pack can't be downloaded and
  // persisted only to be evicted on the next launch (see fetchPack's disk path).
  if (typeof data?.version !== 'number' || data.version < PACK_MIN_VERSION) {
    throw new Error('Invalid pack: unsupported version');
  }
  if (!Array.isArray(data?.puzzles) || data.puzzles.length === 0) {
    throw new Error('Invalid pack: missing puzzles');
  }
  for (const p of data.puzzles as Array<{ sbn?: unknown }>) {
    if (typeof p?.sbn !== 'string' || !/^\d+x\d+\./.test(p.sbn)) {
      throw new Error('Invalid pack: malformed puzzle SBN');
    }
  }
  return data as unknown as Pack;
}

export function getCachedEtag(key: string): string | undefined {
  return packMetaStorage.getString(`etag:${key}`) ?? undefined;
}

export function setCachedEtag(key: string, etag: string): void {
  packMetaStorage.set(`etag:${key}`, etag);
}

export async function fetchFromSupabase(storageKey: string): Promise<string> {
  __DEV__ &&
    console.log(
      `[SB:PACK] supabase.storage.from('packs').download('${storageKey}')`,
    );
  const { data, error } = await supabase.storage
    .from('packs')
    .download(storageKey);
  if (error) {
    // Capture the real failure so a storage RLS denial (403) can be told apart
    // from a genuinely missing object (404) and from a transient network error.
    // StorageApiError carries status/statusCode/name; plain network errors don't.
    const e = error as { message?: string; status?: number; statusCode?: string; name?: string };
    console.warn(
      `[SB:PACK] download failed for '${storageKey}' — name=${e.name} status=${e.status ?? e.statusCode} message=${e.message}`,
    );
    throw error;
  }
  if (!data) throw new Error(`No data for ${storageKey}`);
  return blobToText(data);
}

// Returns the remote ETag for a storage path. Throws on network error so
// callers can catch and return early (treating unavailability as a skip).
export async function fetchPackEtag(
  storagePath: string,
): Promise<string | undefined> {
  const { data, error } = await supabase.storage
    .from('packs')
    .info(storagePath);
  if (error) throw error;
  return data?.etag ?? undefined;
}

// localKey = disk filename (e.g. "pack-id.json")
// remoteKey = Supabase storage path; defaults to localKey when omitted
export async function fetchPack(
  localKey: string,
  remoteKey?: string,
): Promise<Pack> {
  assertSafeKey(localKey);
  const effectiveRemoteKey = remoteKey ?? localKey;
  const rnfs = getRNFS();
  if (rnfs) {
    const localPath = `${rnfs.DocumentDirectoryPath}/packs/${localKey}`;
    try {
      const raw = await rnfs.readFile(localPath, 'utf8');
      const pack = decodeFromDisk(raw);
      __DEV__ &&
        console.log(
          `[SB:PACK] ${localKey}: ${(raw.length / 1024).toFixed(1)} KB, ${
            pack.puzzles?.length ?? '?'
          } puzzles`,
        );
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
    const downloaded = validatePackText(text);
    await rnfs.mkdir(`${rnfs.DocumentDirectoryPath}/packs`).catch(() => {});
    await rnfs
      .writeFile(localPath, encodeForDisk(text), 'utf8')
      .catch(() => {});
    __DEV__ &&
      console.log(
        `[SB:PACK] ${localKey} downloaded — v${downloaded.version}, ${
          downloaded.puzzles?.length
        } puzzles, keys: ${Object.keys(downloaded.puzzles?.[0] ?? {}).join(
          ',',
        )}`,
      );
    return downloaded;
  }
  return fetchFromSupabase(effectiveRemoteKey).then(
    text => JSON.parse(text) as Pack,
  );
}

export function validateHintsText(text: string): void {
  const data = JSON.parse(text) as { hints?: HintStep[][] };
  if (!Array.isArray(data.hints)) {
    throw new Error('Invalid hints file: missing hints array');
  }
}

// Disk-first read of "{packId}-hints.json"; mirrors fetchPack.
export async function fetchHints(packId: string): Promise<HintStep[][]> {
  assertSafeKey(packId);
  const key = `${packId}-hints.json`;
  const rnfs = getRNFS();
  if (rnfs) {
    const localPath = `${rnfs.DocumentDirectoryPath}/packs/${key}`;
    try {
      const raw = await rnfs.readFile(localPath, 'utf8');
      return decodeHintsFromDisk(raw).hints;
    } catch {
      // not on disk yet — fall through to network
    }
    const text = await fetchFromSupabase(key);
    validateHintsText(text);
    await rnfs.mkdir(`${rnfs.DocumentDirectoryPath}/packs`).catch(() => {});
    await rnfs.writeFile(localPath, encodeForDisk(text), 'utf8').catch(() => {});
    return (JSON.parse(text) as HintsFile).hints;
  }
  const text = await fetchFromSupabase(key);
  validateHintsText(text);
  return (JSON.parse(text) as HintsFile).hints;
}
