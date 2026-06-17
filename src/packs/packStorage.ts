import { NativeModules, Platform } from 'react-native';
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

// --- Large-file read -----------------------------------------------------
// Reads a cached file as text. The mechanism is platform-split because the two
// platforms break in opposite ways:
//
// iOS — reads via fetch('file://'). RNFS 2.20.0 is broken/slow for reads on RN
//   0.84's New Architecture here: read() declares `NSInteger *` params the
//   new-arch legacy interop rejects ("Objective C type NSInteger is
//   unsupported"), and readFile() marshals the whole string through that same
//   slow shim — MEASURED at ~28s for the 3.7MB hints file. RN's networking stack
//   reads file:// natively and efficiently (sub-second for the same file).
//
// Android — reads via rnfs.readFile. RN's networking layer (OkHttp) REJECTS the
//   file:// scheme outright ("Expected URL scheme 'http' or 'https' but was
//   'file'"), so the fetch path throws and every cached read silently fell
//   through to a network re-download — breaking offline hints/packs entirely and
//   re-downloading on every cold open while online. The ~28s RNFS slowness above
//   was iOS-specific (Objective-C interop); Android's JNI readFile is fast.
//
// Timed ([SB:FSREAD]); callers don't await hints, so a modest read never blocks
// first paint.
export async function readFileText(path: string, label: string): Promise<string> {
  const end = time('FSREAD', `readFile ${label}`);
  let text: string;
  if (Platform.OS === 'android') {
    const rnfs = getRNFS();
    if (!rnfs) throw new Error('RNFS unavailable for file read');
    text = await rnfs.readFile(path, 'utf8');
  } else {
    const res = await fetch(`file://${path}`);
    text = await res.text();
  }
  end(`${(text.length / 1024).toFixed(0)} KB`);
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
