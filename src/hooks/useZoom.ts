import { useCallback, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { MAX_ZOOM, MIN_ZOOM } from '../utils/constants';

export function useZoom() {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const savedScale = useRef(1);
  const savedTranslateX = useRef(0);
  const savedTranslateY = useRef(0);

  const [isZoomed, setIsZoomed] = useState(false);

  const handleZoomReset = useCallback(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: MIN_ZOOM, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start();
    savedScale.current = MIN_ZOOM;
    savedTranslateX.current = 0;
    savedTranslateY.current = 0;
    setIsZoomed(false);
  }, [scale, translateX, translateY]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => {
      scale.setValue(savedScale.current * e.scale);
    })
    .onEnd(e => {
      const clamped = Math.max(
        MIN_ZOOM,
        Math.min(savedScale.current * e.scale, MAX_ZOOM),
      );
      savedScale.current = clamped;
      Animated.spring(scale, {
        toValue: clamped,
        useNativeDriver: true,
      }).start();
      setIsZoomed(clamped !== MIN_ZOOM);
    });

  const panGesture = Gesture.Pan()
    .onUpdate(e => {
      translateX.setValue(savedTranslateX.current + e.translationX);
      translateY.setValue(savedTranslateY.current + e.translationY);
    })
    .onEnd(e => {
      savedTranslateX.current += e.translationX;
      savedTranslateY.current += e.translationY;
    });

  const gesture = Gesture.Simultaneous(pinchGesture, panGesture);

  return { gesture, scale, translateX, translateY, isZoomed, handleZoomReset };
}
