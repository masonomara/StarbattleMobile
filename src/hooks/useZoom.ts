import { useCallback, useRef, useState } from 'react';
import { Animated, useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  CELL_SIZE,
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  PAN_PADDING,
} from '../utils/constants';

const SPRING_CONFIG = { friction: 19, tension: 90, useNativeDriver: true } as const;

export function useZoom(puzzleSize: number) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const savedScale = useRef(1);
  const savedTranslateX = useRef(0);
  const savedTranslateY = useRef(0);

  const [isZoomed, setIsZoomed] = useState(false);

  const boardPixels = CELL_SIZE * puzzleSize;

  const clampTranslate = useCallback(
    (tx: number, ty: number, currentScale: number) => {
      const effectiveW = boardPixels * currentScale;
      const effectiveH = boardPixels * currentScale;

      const maxX = Math.max(0, (effectiveW - screenWidth) / 2 + PAN_PADDING);
      const maxY = Math.max(0, (effectiveH - screenHeight) / 2 + PAN_PADDING);

      return {
        x: Math.max(-maxX, Math.min(tx, maxX)),
        y: Math.max(-maxY, Math.min(ty, maxY)),
      };
    },
    [boardPixels, screenWidth, screenHeight],
  );

  const springBack = useCallback(
    (clampedX: number, clampedY: number) => {
      Animated.parallel([
        Animated.spring(translateX, { toValue: clampedX, ...SPRING_CONFIG }),
        Animated.spring(translateY, { toValue: clampedY, ...SPRING_CONFIG }),
      ]).start();
    },
    [translateX, translateY],
  );

  const handleZoomReset = useCallback(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: DEFAULT_ZOOM, ...SPRING_CONFIG }),
      Animated.spring(translateX, { toValue: 0, ...SPRING_CONFIG }),
      Animated.spring(translateY, { toValue: 0, ...SPRING_CONFIG }),
    ]).start();
    savedScale.current = DEFAULT_ZOOM;
    savedTranslateX.current = 0;
    savedTranslateY.current = 0;
    setIsZoomed(false);
  }, [scale, translateX, translateY]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => {
      scale.setValue(savedScale.current * e.scale);
    })
    .onEnd(e => {
      const clampedScale = Math.max(
        MIN_ZOOM,
        Math.min(savedScale.current * e.scale, MAX_ZOOM),
      );
      savedScale.current = clampedScale;
      Animated.spring(scale, {
        toValue: clampedScale,
        ...SPRING_CONFIG,
      }).start();

      // Re-clamp pan position for the new zoom level
      const clamped = clampTranslate(
        savedTranslateX.current,
        savedTranslateY.current,
        clampedScale,
      );
      if (
        clamped.x !== savedTranslateX.current ||
        clamped.y !== savedTranslateY.current
      ) {
        savedTranslateX.current = clamped.x;
        savedTranslateY.current = clamped.y;
        springBack(clamped.x, clamped.y);
      }

      setIsZoomed(clampedScale !== DEFAULT_ZOOM);
    });

  const panGesture = Gesture.Pan()
    .onUpdate(e => {
      translateX.setValue(savedTranslateX.current + e.translationX);
      translateY.setValue(savedTranslateY.current + e.translationY);
    })
    .onEnd(e => {
      const rawX = savedTranslateX.current + e.translationX;
      const rawY = savedTranslateY.current + e.translationY;
      const clamped = clampTranslate(rawX, rawY, savedScale.current);

      savedTranslateX.current = clamped.x;
      savedTranslateY.current = clamped.y;

      if (clamped.x !== rawX || clamped.y !== rawY) {
        springBack(clamped.x, clamped.y);
      }
    });

  return {
    pinchGesture,
    panGesture,
    scale,
    translateX,
    translateY,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    isZoomed,
    handleZoomReset,
  };
}
