declare const process: { env: Record<string, string | undefined> };

// Provided at runtime by the `fast-text-encoding` polyfill (imported in index.js).
// Declared here because the RN TS lib doesn't include the DOM TextDecoder.
declare class TextDecoder {
  constructor(label?: string);
  decode(input?: ArrayBuffer | ArrayBufferView): string;
}

declare module 'lucide-react-native/dist/cjs/icons/*' {
  import type { LucideIcon } from 'lucide-react-native';
  const icon: LucideIcon;
  export default icon;
}
