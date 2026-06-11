import { NativeModules } from 'react-native';
import type * as RNFSType from 'react-native-fs';
import type { Pack, HintsFile } from '../types';
import { time } from '../shared/lib/perfLog';

export function getRNFS(): typeof RNFSType | null {
  if (!NativeModules.RNFSManager) return null;
  try {
    return require('react-native-fs') as typeof RNFSType;
  } catch {
    return null;
  }
}

// Guards against path traversal: pack keys are used directly as filenames,
// so slashes or ".." in a key could escape the packs directory.
export function assertSafeKey(key: string): void {
  if (/[/\\]/.test(key) || key.includes('..')) {
    throw new Error(`Unsafe pack key: ${key}`);
  }
}

// Placeholders for a potential future encryption or compression layer.
// encodeForDisk currently passes the JSON string through unchanged.
// decodeFromDisk parses it back. If compression is added, update both.
// DEBT: encoding/decoding is asymmetric and now has a third path. Writes go
// through writeFileThrottled (applies encodeForDisk) OR downloadToFile (streams
// raw network bytes, bypassing encodeForDisk entirely); reads go through
// decodeFromDisk. All three agree only while encodeForDisk is a passthrough. If
// an encryption/compression layer is ever added, the downloadToFile path can't
// apply it mid-stream — it would need a post-download re-encode, or those files
// must be stored already-encoded server-side.
export function encodeForDisk(text: string): string {
  return text;
}

export function decodeFromDisk(text: string): Pack {
  return JSON.parse(text) as Pack;
}

export function decodeHintsFromDisk(text: string): HintsFile {
  return JSON.parse(text) as HintsFile;
}

// --- Non-blocking large-file read ---------------------------------------
// rnfs.readFile(path, 'utf8') marshals the WHOLE file across the bridge in one
// call; for a multi-MB file (the 3.7MB daily hints) that single marshal pins the
// JS thread/bridge for tens of seconds, freezing taps and frames on puzzle open.
// readFileChunked reads the file in byte-ranged chunks via rnfs.read() and
// awaits a macrotask between each, so queued touch/frame/timer events interleave
// and gameplay stays responsive while hints load in the background.

// 256KB-ish, kept a multiple of 3 so every non-final base64 chunk is unpadded and
// decodes to an exact byte boundary (3 bytes ↔ 4 base64 chars).
const READ_CHUNK_BYTES = 262143;

// Dependency-free base64 → bytes. RN has no atob/Buffer; each rnfs.read('base64')
// chunk is whole bytes, so decoding chunks independently and concatenating the
// bytes is exact. UTF-8 decoding happens once on the assembled bytes (below) so
// multi-byte characters split across chunk boundaries are never corrupted.
const B64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(256);
for (let i = 0; i < B64_ALPHABET.length; i++) {
  B64_LOOKUP[B64_ALPHABET.charCodeAt(i)] = i;
}

/* eslint-disable no-bitwise -- base64 decode is inherently bit-twiddling */
function base64ToBytes(b64: string): Uint8Array {
  const len = b64.length;
  if (len === 0) return new Uint8Array(0);
  let pad = 0;
  if (b64.charCodeAt(len - 1) === 61) pad++; // '='
  if (b64.charCodeAt(len - 2) === 61) pad++;
  const out = new Uint8Array((len / 4) * 3 - pad);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64_LOOKUP[b64.charCodeAt(i)];
    const b = B64_LOOKUP[b64.charCodeAt(i + 1)];
    const c = B64_LOOKUP[b64.charCodeAt(i + 2)];
    const d = B64_LOOKUP[b64.charCodeAt(i + 3)];
    out[p++] = (a << 2) | (b >> 4);
    if (b64.charCodeAt(i + 2) !== 61) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (b64.charCodeAt(i + 3) !== 61) out[p++] = ((c & 3) << 6) | d;
  }
  return out;
}
/* eslint-enable no-bitwise */

// Yield to the event loop so native-queued events (touches, frame callbacks,
// timers) get a turn between chunks. setTimeout(0) is a macrotask boundary.
function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// Reads an entire file as a UTF-8 string WITHOUT a single giant bridge marshal.
// label is used only for the perf logs so callers stay identifiable.
export async function readFileChunked(
  rnfs: typeof RNFSType,
  path: string,
  label: string,
): Promise<string> {
  const stat = await rnfs.stat(path);
  const total = Number(stat.size);
  const bytes = new Uint8Array(total);
  let offset = 0;
  const endRead = time('FSREAD', `chunked read ${label} (${Math.ceil(total / READ_CHUNK_BYTES)} chunks)`);
  while (offset < total) {
    const len = Math.min(READ_CHUNK_BYTES, total - offset);
    const b64 = await rnfs.read(path, len, offset, 'base64');
    bytes.set(base64ToBytes(b64), offset);
    offset += len;
    await yieldToEventLoop();
  }
  endRead(`${(total / 1024).toFixed(0)} KB`);
  // Single UTF-8 decode of the assembled bytes. Timed separately: if THIS blocks
  // meaningfully it's the next thing to chunk; the read loop above never does.
  const endDecode = time('FSREAD', `TextDecoder ${label}`);
  const text = new TextDecoder('utf-8').decode(bytes);
  endDecode(`${(total / 1024).toFixed(0)} KB`);
  return text;
}

// Caps concurrent disk writes. react-native-fs serializes writeFile across the
// bridge and marshals each utf8 payload whole; firing the entire catalog's
// writes at once (~42 files on first launch) saturates the bridge and pins the
// JS thread for tens of seconds — taps, draws, and navigation queue behind it.
// The real write work is trivial (a few MB total); only contention was slow, so
// a small cap keeps the bridge responsive while writes still finish promptly.
const MAX_CONCURRENT_WRITES = 3;
let activeWrites = 0;
const writeQueue: Array<() => void> = [];

function acquireWriteSlot(): Promise<void> {
  if (activeWrites < MAX_CONCURRENT_WRITES) {
    activeWrites++;
    return Promise.resolve();
  }
  return new Promise(resolve => writeQueue.push(resolve));
}

function releaseWriteSlot(): void {
  const next = writeQueue.shift();
  if (next) {
    // Hand the slot straight to the next waiter — count stays at the cap.
    next();
  } else {
    activeWrites--;
  }
}

// Concurrency-limited replacement for rnfs.writeFile(path, text, 'utf8'). Applies
// encodeForDisk so every write path shares the same encoding. Rejection (e.g. a
// full disk) propagates to the caller; the slot is always released.
export async function writeFileThrottled(
  rnfs: typeof RNFSType,
  path: string,
  text: string,
): Promise<void> {
  await acquireWriteSlot();
  try {
    await rnfs.writeFile(path, encodeForDisk(text), 'utf8');
  } finally {
    releaseWriteSlot();
  }
}
