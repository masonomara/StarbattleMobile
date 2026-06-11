import { supabase } from '../shared/lib/supabase';
import { packMetaStorage } from '../shared/lib/mmkv';
import type { Pack, HintStep } from '../types';
import {
  getRNFS,
  assertSafeKey,
  decodeFromDisk,
  decodeHintsFromDisk,
  writeFileThrottled,
  readFileText,
} from './packStorage';
import { mark, time } from '../shared/lib/perfLog';

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

// Signed URLs only need to outlive a single download; 10 minutes is generous.
const SIGNED_URL_TTL_SECONDS = 600;

// Streams a storage object straight to disk via a signed URL so the bytes never
// enter the JS heap. This is the offline-cache write path for prefetch: pulling
// a Blob into a string (blobToText) and pushing a large utf8 string back out
// (writeFile) each marshal the whole payload across the bridge and block the JS
// thread ~2s per multi-MB file — the residual first-launch freeze after write
// throttling. downloadFile does the transfer natively, off the JS thread.
// NOTE: bypasses encodeForDisk (see packStorage) — the file lands as raw bytes
// from the network. Fine while encodeForDisk is a passthrough; if a compression
// or encryption layer is ever added, this path must apply it too.
export async function downloadToFile(
  storagePath: string,
  localPath: string,
): Promise<void> {
  const rnfs = getRNFS();
  if (!rnfs) throw new Error('File system unavailable');
  const { data, error } = await supabase.storage
    .from('packs')
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw error ?? new Error(`No signed URL for ${storagePath}`);
  }
  // Capture the advertised body size so we can reject a truncated download
  // (e.g. the connection dropped mid-stream but still reported 200). Without
  // this, a partial file would be persisted AND its ETag cached, so prefetch
  // would skip re-downloading it and offline would be permanently broken for
  // that pack. This replaces the structural validation the old blob path got
  // from JSON.parse — without reading the file back across the bridge.
  let expectedBytes = -1;
  const result = await rnfs.downloadFile({
    fromUrl: data.signedUrl,
    toFile: localPath,
    // Force an UNCOMPRESSED transfer. Supabase fronts storage with Cloudflare,
    // which gzips JSON on the fly whenever the client sends Accept-Encoding: gzip
    // (NSURLSession does by default) AND then drops Content-Length (HTTP/2
    // streaming). That breaks this path two ways: (1) the truncation guard below
    // goes inert because `begin` reports contentLength = -1, and (2) if the
    // native download layer doesn't transparently inflate the body, the raw gzip
    // bytes land on disk and every later JSON.parse throws — which surfaces as
    // fetchHints' "streaming failed" in-memory fallback on cold daily-open.
    // identity restores a real Content-Length (so the truncation guard below
    // works) and guarantees plain JSON on disk. The catalog is a one-time
    // offline-library prefetch, so the larger transfer is an acceptable trade for
    // a reliable offline cache.
    headers: { 'Accept-Encoding': 'identity' },
    begin: ({ contentLength }) => {
      expectedBytes = contentLength;
    },
  }).promise;
  // With identity the body is uncompressed, so bytesWritten should EQUAL
  // expectedBytes. Keep "<" (not "!=") as defense-in-depth: a truncated body
  // always writes fewer bytes than advertised, and should a CDN ever ignore
  // identity and gzip anyway, a transparently-inflated body writes MORE than the
  // (compressed) Content-Length — which we must not false-reject.
  const truncated = expectedBytes > 0 && result.bytesWritten < expectedBytes;
  if (result.statusCode !== 200 || truncated) {
    // Remove the partial/error body so a later read doesn't parse garbage and
    // so the caller never caches an ETag for it.
    await rnfs.unlink(localPath).catch(() => {});
    throw new Error(
      `download ${storagePath} failed: status=${result.statusCode} bytes=${result.bytesWritten}/${expectedBytes}`,
    );
  }
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
    let raw: string | null = null;
    try {
      // readFile over JSI (new arch); the board/home never await this read.
      raw = await readFileText(localPath, localKey);
    } catch {
      // not on disk yet (stat/read threw) — fall through to network below
    }
    if (raw !== null) {
      const endParse = time('PACK', `JSON.parse ${localKey}`);
      try {
        const pack = decodeFromDisk(raw);
        if (pack.version < PACK_MIN_VERSION) throw new Error('stale version');
        endParse(`${pack.puzzles?.length ?? '?'} puzzles`);
        return pack;
      } catch {
        // On disk but corrupt or stale: evict the file AND its ETag so the next
        // prefetch re-downloads it (an ETag match would otherwise skip it),
        // then fall through to a network re-fetch. Clear both possible ETag
        // keys — prefetch caches under the remote storagePath, callers may use
        // the local filename — since a missing-key remove is a harmless no-op.
        await rnfs.unlink(localPath).catch(() => {});
        packMetaStorage.remove(`etag:${localKey}`);
        if (effectiveRemoteKey !== localKey) {
          packMetaStorage.remove(`etag:${effectiveRemoteKey}`);
        }
      }
    }
    const text = await fetchFromSupabase(effectiveRemoteKey);
    const downloaded = validatePackText(text);
    await rnfs.mkdir(`${rnfs.DocumentDirectoryPath}/packs`).catch(() => {});
    await writeFileThrottled(rnfs, localPath, text).catch(() => {});
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

// Validates and returns the parsed hints so callers reuse this parse instead of
// JSON.parse-ing the same (often multi-MB) text a second time.
export function validateHintsText(text: string): HintStep[][] {
  const data = JSON.parse(text) as { hints?: HintStep[][] };
  if (!Array.isArray(data.hints)) {
    throw new Error('Invalid hints file: missing hints array');
  }
  return data.hints;
}

// Disk-first read of "{packId}-hints.json"; mirrors fetchPack.
export async function fetchHints(packId: string): Promise<HintStep[][]> {
  assertSafeKey(packId);
  const key = `${packId}-hints.json`;
  const rnfs = getRNFS();
  if (rnfs) {
    const localPath = `${rnfs.DocumentDirectoryPath}/packs/${key}`;
    let raw: string | null = null;
    try {
      // readFile over JSI (new arch); the board loads hints without awaiting
      // this, so the largest file in the catalog never blocks puzzle open.
      raw = await readFileText(localPath, key);
    } catch {
      // not on disk yet (stat/read threw) — fall through to network below
    }
    if (raw !== null) {
      const endParse = time('HINTS', `JSON.parse ${key}`);
      try {
        const parsed = decodeHintsFromDisk(raw).hints;
        endParse(`${parsed.length} puzzles`);
        return parsed;
      } catch {
        // On disk but corrupt: evict the file and its ETag so the next prefetch
        // re-downloads it instead of skipping on a matching ETag.
        await rnfs.unlink(localPath).catch(() => {});
        packMetaStorage.remove(`etag:${key}`);
      }
    }
    // Not on disk (or evicted as corrupt). Stream the download straight to disk
    // natively (downloadToFile, off the JS thread) then read it back. This is the
    // cold-open path when prefetch hasn't yet finished this file; the old path
    // here did fetchFromSupabase + writeFileThrottled, which marshalled the whole
    // 3.7MB across the bridge to WRITE it and froze the JS thread ~28s.
    mark('HINTS', `${key} not on disk — streaming download to disk`);
    const packDir = `${rnfs.DocumentDirectoryPath}/packs`;
    await rnfs.mkdir(packDir).catch(() => {});
    try {
      const endDl = time('HINTS', `downloadToFile ${key}`);
      await downloadToFile(key, localPath);
      endDl();
      const text = await readFileText(localPath, key);
      const endParse = time('HINTS', `JSON.parse ${key} (after download)`);
      const parsed = decodeHintsFromDisk(text).hints;
      endParse(`${parsed.length} puzzles`);
      return parsed;
    } catch (e) {
      // Streaming/read failed (FS error, or a genuinely offline first-open).
      // Last resort: in-memory fetch. This marshals across the bridge and can
      // stall, but only when streaming to disk is impossible — better than no
      // hints. Returns without persisting; the next prefetch caches it properly.
      // Surface the real reason so a streaming failure can't hide as a "fallback".
      mark(
        'HINTS',
        `${key} streaming failed (${(e as Error)?.message ?? String(e)}) — in-memory fallback`,
      );
      const text = await fetchFromSupabase(key);
      return validateHintsText(text);
    }
  }
  const text = await fetchFromSupabase(key);
  return validateHintsText(text);
}
