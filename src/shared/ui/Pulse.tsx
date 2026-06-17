import React, { createContext, useContext, useEffect } from 'react';
import { View } from 'react-native';
import { tokens } from '../theme/palettes';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { PulseBoxProps, PulseLineProps } from '../../types';

// The box is a solid baseColor View, so its View opacity reads directly as the
// base color's opacity: pulse between 67% and 33%.
const MAX_OPACITY = 0.9;
const MIN_OPACITY = 0.45;
const PULSE_MS = 850;

function startPulse(opacity: SharedValue<number>) {
  opacity.value = withRepeat(
    withTiming(MIN_OPACITY, {
      duration: PULSE_MS,
      easing: Easing.inOut(Easing.ease),
    }),
    -1,
    true,
  );
}

const PulseContext = createContext<SharedValue<number> | null>(null);

// Drives a single shared opacity loop for every PulseBox rendered beneath it.
// Two reasons to share one clock instead of animating per box:
//   1. Sync — boxes that mount at different times would otherwise pulse on their
//      own phase and look staggered.
//   2. Continuity — the phase lives here, not in the boxes, so a box mounting or
//      unmounting (e.g. generic skeletons → per-pack skeletons as the catalog
//      loads) reads the ongoing pulse instead of restarting from the start.
export function PulseProvider({ children }: { children: React.ReactNode }) {
  const opacity = useSharedValue(MAX_OPACITY);

  useEffect(() => {
    startPulse(opacity);
    return () => cancelAnimation(opacity);
  }, [opacity]);

  return (
    <PulseContext.Provider value={opacity}>{children}</PulseContext.Provider>
  );
}

// Skeleton placeholder: a solid rounded block whose opacity pulses on the UI
// thread (no per-frame JS, no Skia canvas). Inside a PulseProvider every box
// shares one continuous phase; standalone it falls back to its own loop.
export function PulseBox({
  width,
  height,
  radius = 5,
  baseColor,
  style,
}: PulseBoxProps) {
  const shared = useContext(PulseContext);
  const local = useSharedValue(MAX_OPACITY);

  useEffect(() => {
    if (shared) return; // a PulseProvider above owns the animation
    startPulse(local);
    return () => cancelAnimation(local);
  }, [shared, local]);

  const driver = shared ?? local;
  const animatedStyle = useAnimatedStyle(() => ({ opacity: driver.value }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { width, height, borderRadius: radius, backgroundColor: baseColor },
        animatedStyle,
        style,
      ]}
    />
  );
}

// Measured cap-to-em ratio of the type scale: the bar stands for the text's ink
// (cap height), not the full leading, so it reads as a line of text rather than
// a chunky full-leading block. 0.70 reproduces the hand-tuned bars exactly
// (title1 round(30·0.7)=21, body round(17·0.7)=12).
const CAP_RATIO = 0.7;

// Skeleton for one line of text. The outer box claims the real line's full
// lineHeight (so the placeholder footprint matches the Text it stands in for),
// while the pulsing bar inside is sized to the text's ink (~cap height) and
// centered. Pass `role` to pull both from the type scale `Text` reads, so the
// skeleton tracks the role's size automatically and can't drift.
export function PulseLine({
  width,
  role,
  lineHeight,
  barHeight,
  radius = 4,
  baseColor,
  style,
}: PulseLineProps) {
  // The props union guarantees an explicit lineHeight/barHeight whenever `role`
  // is absent, but destructuring drops that correlation — hence the asserts.
  const t = role ? tokens.type[role] : null;
  const resolvedLineHeight = t ? t.lineHeight : lineHeight!;
  const resolvedBarHeight = t ? Math.round(t.fontSize * CAP_RATIO) : barHeight!;
  return (
    <View
      style={[{ height: resolvedLineHeight, justifyContent: 'center' }, style]}
    >
      <PulseBox
        width={width}
        height={resolvedBarHeight}
        radius={radius}
        baseColor={baseColor}
      />
    </View>
  );
}
