import { NativeModules } from 'react-native';
import type * as RNFSType from 'react-native-fs';
import type { Pack } from '../types';

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
// DEBT: encodeForDisk is called in 3 write paths but decodeFromDisk is only
// called in one read path (fetchPack). The asymmetry will cause subtle bugs if
// encoding is ever changed — make sure every write path has a matching read.
export function encodeForDisk(text: string): string {
  return text;
}

export function decodeFromDisk(text: string): Pack {
  return JSON.parse(text) as Pack;
}
