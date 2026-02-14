import React, { useEffect, useMemo, useCallback, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { CellView } from './CellView';
import { usePuzzleStore } from '../store';

import type { Puzzle, Borders } from '../types/puzzle';
import { CELL_SIZE, MAX_ZOOM, MIN_ZOOM } from '../utils/constants';
import { useTheme } from '../utils/useTheme';

type Props = {
  puzzle: Puzzle;
  zoomResetRef?: React.MutableRefObject<(() => void) | null>;
  onZoomChange?: (isZoomed: boolean) => void;
};

export function BoardView({ puzzle, zoomResetRef, onZoomChange }: Props) {
  const theme = useTheme();
  const tapCell = usePuzzleStore(s => s.tapCell);
  const boardSize = CELL_SIZE * puzzle.size;

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const savedScale = useRef(1);
  const savedTranslateX = useRef(0);
  const savedTranslateY = useRef(0);

  const resetZoom = useCallback(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: MIN_ZOOM, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start();
    savedScale.current = MIN_ZOOM;
    savedTranslateX.current = 0;
    savedTranslateY.current = 0;
    onZoomChange?.(false);
  }, [scale, translateX, translateY, onZoomChange]);

  useEffect(() => {
    if (zoomResetRef) zoomResetRef.current = resetZoom;
  }, [zoomResetRef, resetZoom]);

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
      onZoomChange?.(clamped !== MIN_ZOOM);
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

  const composed = Gesture.Simultaneous(pinchGesture, panGesture);

  const cellBorders = useMemo(() => {
    const borders: Borders[] = [];
    for (let row = 0; row < puzzle.size; row++) {
      for (let col = 0; col < puzzle.size; col++) {
        const region = puzzle.regions[row][col];
        borders.push({
          top: row === 0 || puzzle.regions[row - 1][col] !== region,
          bottom:
            row === puzzle.size - 1 || puzzle.regions[row + 1][col] !== region,
          left: col === 0 || puzzle.regions[row][col - 1] !== region,
          right:
            col === puzzle.size - 1 || puzzle.regions[row][col + 1] !== region,
        });
      }
    }
    return borders;
  }, [puzzle]);

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          styles.board,
          {
            width: boardSize,
            height: boardSize,
            transform: [{ translateX }, { translateY }, { scale }],
          },
        ]}
      >
        {cellBorders.map((borders, i) => {
          const row = Math.floor(i / puzzle.size);
          const col = i % puzzle.size;
          return (
            <CellView
              key={i}
              row={row}
              col={col}
              borders={borders}
              theme={theme}
              onPress={tapCell}
            />
          );
        })}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  board: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
