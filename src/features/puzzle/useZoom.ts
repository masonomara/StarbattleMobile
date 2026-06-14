import { useState, useCallback, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';

const DEFAULT_ZOOM = 1;
const MIN_ZOOM = 0.67; // ~2/3 — lets small boards breathe on large screens
const MAX_ZOOM = 3;
// Extra pixels the board can be panned beyond its visible edge, giving the user
// comfortable overscroll before the spring snaps it back.
const PAN_PADDING = 120;
// When a board fits within the visible area on an axis it used to spring to dead
// center, which fought the user whenever they nudged it. Instead we let it rest
// wherever it's left, springing back only once it drifts close enough to an edge
// that less than this much gap would remain. The spring stays disabled inside
// that comfortable zone.
const REST_EDGE_MARGIN = 80;

// High-stiffness spring for snappy snap-back; no explicit damping so Reanimated
// uses its default (critically damped), avoiding oscillation.
const SPRING_CONFIG = { stiffness: 750 } as const;

// Vertical pan bound, measured against the visible play area. A board taller
// than the play area can be panned far enough to bring its hidden top/bottom
// rows into view, plus PAN_PADDING of overscroll. A board that fits rests
// freely within the leftover space (minus a comfortable margin) rather than
// snapping to dead center.
function boundY(effectiveH: number, playHeight: number) {
  'worklet';
  const overflow = (effectiveH - playHeight) / 2;
  return overflow > 0
    ? overflow + PAN_PADDING
    : Math.max(0, -overflow - REST_EDGE_MARGIN);
}

// verticalChrome is the height the header + toolbar (plus safe-area insets) eat
// out of the screen. The board rests centered in the play area *between* them,
// not in the full screen, so its pan bounds must be measured against that area —
// otherwise a board taller than the play area but shorter than the screen (the
// weekly grid) reads as "fits" and snaps to center with its top/bottom rows
// stuck under the chrome.
export function useZoom(
  puzzleSize: number,
  cellSize: number,
  verticalChrome: number,
) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  // Visible vertical space the board actually centers within.
  const playHeight = Math.max(0, screenHeight - verticalChrome);

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const [isZoomed, setIsZoomed] = useState(false);

  const lastGestureEndRef = useRef<number>(0);
  const recordGestureEnd = useCallback(() => {
    lastGestureEndRef.current = Date.now();
  }, []);

  const boardPixels = cellSize * puzzleSize;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // Gesture handlers run on the UI worklet thread (the 'worklet' directive).
  // runOnJS bridges back to the JS thread only for the state setters that
  // React needs to know about (isZoomed) or side-effects (recordGestureEnd).
  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => {
      'worklet';
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(e => {
      'worklet';
      const clampedScale = Math.max(
        MIN_ZOOM,
        Math.min(savedScale.value * e.scale, MAX_ZOOM),
      );
      savedScale.value = clampedScale;
      scale.value = withSpring(clampedScale, SPRING_CONFIG);

      const effectiveW = boardPixels * clampedScale;
      const effectiveH = boardPixels * clampedScale;
      // X: if the board fits within the screen the bound is 0, so it always
      // springs back to dead center; otherwise allow overscroll padding.
      const maxX =
        effectiveW <= screenWidth
          ? 0
          : (effectiveW - screenWidth) / 2 + PAN_PADDING;
      const maxY = boundY(effectiveH, playHeight);
      const cx = Math.max(-maxX, Math.min(savedTranslateX.value, maxX));
      const cy = Math.max(-maxY, Math.min(savedTranslateY.value, maxY));

      if (cx !== savedTranslateX.value || cy !== savedTranslateY.value) {
        savedTranslateX.value = cx;
        savedTranslateY.value = cy;
        translateX.value = withSpring(cx, SPRING_CONFIG);
        translateY.value = withSpring(cy, SPRING_CONFIG);
      }

      runOnJS(setIsZoomed)(
        clampedScale !== DEFAULT_ZOOM ||
          savedTranslateX.value !== 0 ||
          savedTranslateY.value !== 0,
      );
      runOnJS(recordGestureEnd)();
    });

  const panGesture = Gesture.Pan()
    .onUpdate(e => {
      'worklet';
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(e => {
      'worklet';
      const rawX = savedTranslateX.value + e.translationX;
      const rawY = savedTranslateY.value + e.translationY;

      const effectiveW = boardPixels * savedScale.value;
      const effectiveH = boardPixels * savedScale.value;
      // X: if the board fits within the screen the bound is 0, so it always
      // springs back to dead center; otherwise allow overscroll padding.
      const maxX =
        effectiveW <= screenWidth
          ? 0
          : (effectiveW - screenWidth) / 2 + PAN_PADDING;
      const maxY = boundY(effectiveH, playHeight);
      const cx = Math.max(-maxX, Math.min(rawX, maxX));
      const cy = Math.max(-maxY, Math.min(rawY, maxY));

      savedTranslateX.value = cx;
      savedTranslateY.value = cy;

      if (cx !== rawX || cy !== rawY) {
        translateX.value = withSpring(cx, SPRING_CONFIG);
        translateY.value = withSpring(cy, SPRING_CONFIG);
      }

      runOnJS(setIsZoomed)(
        savedScale.value !== DEFAULT_ZOOM || cx !== 0 || cy !== 0,
      );
      runOnJS(recordGestureEnd)();
    });

  const handleZoomReset = useCallback(() => {
    cancelAnimation(scale);
    cancelAnimation(translateX);
    cancelAnimation(translateY);
    scale.value = withSpring(DEFAULT_ZOOM, SPRING_CONFIG);
    translateX.value = withSpring(0, SPRING_CONFIG);
    translateY.value = withSpring(0, SPRING_CONFIG);
    savedScale.value = DEFAULT_ZOOM;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    setIsZoomed(false);
  }, [
    scale,
    translateX,
    translateY,
    savedScale,
    savedTranslateX,
    savedTranslateY,
  ]);

  return {
    pinchGesture,
    panGesture,
    animatedStyle,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    isZoomed,
    handleZoomReset,
    lastGestureEndRef,
  };
}
