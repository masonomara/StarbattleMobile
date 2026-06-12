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

// High-stiffness spring for snappy snap-back; no explicit damping so Reanimated
// uses its default (critically damped), avoiding oscillation.
const SPRING_CONFIG = { stiffness: 750 } as const;

export function useZoom(puzzleSize: number, cellSize: number) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

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
      // If the board fits within the screen on an axis, the bound is 0 so it
      // always springs back to dead center; otherwise allow overscroll padding.
      const maxX =
        effectiveW <= screenWidth ? 0 : (effectiveW - screenWidth) / 2 + PAN_PADDING;
      const maxY =
        effectiveH <= screenHeight ? 0 : (effectiveH - screenHeight) / 2 + PAN_PADDING;
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
      // If the board fits within the screen on an axis, the bound is 0 so it
      // always springs back to dead center; otherwise allow overscroll padding.
      const maxX =
        effectiveW <= screenWidth ? 0 : (effectiveW - screenWidth) / 2 + PAN_PADDING;
      const maxY =
        effectiveH <= screenHeight ? 0 : (effectiveH - screenHeight) / 2 + PAN_PADDING;
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
