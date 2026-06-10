import { NativeModules } from 'react-native';
import type * as RNFSType from 'react-native-fs';
import type { Pack, HintsFile } from '../types';

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
