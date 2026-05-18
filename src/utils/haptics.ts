import { Haptics } from 'react-native-nitro-haptics';
import { NitroModules } from 'react-native-nitro-modules';

export const boxedHaptics = NitroModules.box(Haptics);

export function hapticLight(): void {
  Haptics.impact('light');
}

export function hapticSuccess(): void {
  Haptics.notification('success');
}

export function hapticMedium(): void {
  Haptics.impact('medium');
}
