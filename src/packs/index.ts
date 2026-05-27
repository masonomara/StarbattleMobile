import { NativeModules } from 'react-native';
import { Buffer } from 'buffer';
import { supabase } from '../supabase';
import { packMetaStorage } from '../mmkv';
import type { RawPuzzle, Pack, StreakType } from '../types';

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

// Replace each puzzle's solution array with a base64-encoded opaque string
// before persisting to disk so solutions aren't stored as human-readable JSON.
function encodeForDisk(text: string): string {
  try {
    const data = JSON.parse(text) as { puzzles?: RawPuzzle[] };
    if (!Array.isArray(data?.puzzles)) return text;
    return JSON.stringify({
      ...data,
      puzzles: data.puzzles.map(p => {
        const { solution, ...rest } = p;
        return { ...rest, _s: Buffer.from(JSON.stringify(solution)).toString('base64') };
      }),
    });
  } catch {
    return text;
  }
}

// Reverse encodeForDisk when loading cached pack data back from disk.
function decodeFromDisk(text: string): string {
  try {
    const data = JSON.parse(text) as {
      puzzles?: Array<Record<string, unknown>>;
    };
    if (!Array.isArray(data?.puzzles)) return text;
    if (!data.puzzles.some(p => '_s' in p)) return text;
    return JSON.stringify({
      ...data,
      puzzles: data.puzzles.map(p => {
        if (!('_s' in p)) return p;
        const { _s, ...rest } = p;
        return { ...rest, solution: JSON.parse(Buffer.from(_s as string, 'base64').toString()) };
      }),
    });
  } catch {
    return text;
  }
}

function assertSafeKey(key: string): void {
  if (/[/\\]/.test(key) || key.includes('..')) {
    throw new Error(`Unsafe pack key: ${key}`);
  }
}

function getCachedEtag(storageKey: string): string | undefined {
  return packMetaStorage.getString(`etag:${storageKey}`) ?? undefined;
}

function setCachedEtag(storageKey: string, etag: string): void {
  packMetaStorage.set(`etag:${storageKey}`, etag);
}

async function fetchFromSupabase(storageKey: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('packs')
    .download(storageKey);
  if (error) throw error;
  if (!data) throw new Error(`No data for ${storageKey}`);
  return blobToText(data);
}

async function fetchPack(storageKey: string): Promise<string> {
  assertSafeKey(storageKey);
  const rnfs = getRNFS();
  if (rnfs) {
    const localPath = `${rnfs.DocumentDirectoryPath}/packs/${storageKey}`;
    try {
      return decodeFromDisk(await rnfs.readFile(localPath, 'utf8'));
    } catch {
      // not on disk yet — fall through to network
    }
    const text = await fetchFromSupabase(storageKey);
    validatePackText(text);
    await rnfs.mkdir(`${rnfs.DocumentDirectoryPath}/packs`).catch(() => {});
    await rnfs
      .writeFile(localPath, encodeForDisk(text), 'utf8')
      .catch(() => {});
    return text;
  }
  return fetchFromSupabase(storageKey);
}

// In-memory cache keyed by storageKey. Stores the in-flight or resolved
// Promise so concurrent callers for the same key share one fetch.
const packCache = new Map<string, Promise<string>>();

function loadPack(storageKey: string): Promise<string> {
  const cached = packCache.get(storageKey);
  if (cached) return cached;

  const promise = fetchPack(storageKey);
  packCache.set(storageKey, promise);
  // Evict on failure so the next call retries rather than re-throwing instantly.
  promise.catch(() => packCache.delete(storageKey));
  return promise;
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

// Downloads a fresh copy of a streak file from Supabase, writes it to disk,
// updates the in-memory cache, and stores the current ETag. Called by the
// prefetch engine when a remote ETag change is detected.
export async function refreshStreakFile(storageKey: string): Promise<void> {
  const rnfs = getRNFS();
  const text = await fetchFromSupabase(storageKey);
  validatePackText(text);

  if (rnfs) {
    const localPath = `${rnfs.DocumentDirectoryPath}/packs/${storageKey}`;
    await rnfs.mkdir(`${rnfs.DocumentDirectoryPath}/packs`).catch(() => {});
    await rnfs.writeFile(localPath, encodeForDisk(text), 'utf8').catch(() => {});
  }

  // Replace the in-memory promise so the next getStreakPack() call gets the
  // refreshed content without a disk read.
  packCache.set(storageKey, Promise.resolve(text));

  // Fetch and persist the ETag so the next prefetch can skip this file.
  try {
    const { data } = await supabase.storage.from('packs').info(storageKey);
    if (data?.etag) setCachedEtag(storageKey, data.etag);
  } catch {
    // Best-effort — missing ETag just means we re-check next foreground.
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
  // Warm the cache with the original (decoded) content.
  packCache.set(`${packId}.json`, Promise.resolve(text));
}
