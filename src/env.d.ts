declare const process: { env: Record<string, string | undefined> };

declare module 'lucide-react-native/dist/cjs/icons/*' {
  import type { LucideIcon } from 'lucide-react-native';
  const icon: LucideIcon;
  export default icon;
}
