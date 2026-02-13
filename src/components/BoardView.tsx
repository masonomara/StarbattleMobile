import React, { useMemo, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions, Animated } from 'react-native';
import { PinchGestureHandler, PanGestureHandler, State } from 'react-native-gesture-handler';
import type { PinchGestureHandlerStateChangeEvent, PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { CellView } from './CellView';
import { useTheme } from '../theme';
import type { GamePuzzle } from '../types';

type Props = {
  puzzle: GamePuzzle;
  onCellPress: (row: number, col: number) => void;
};

const BOARD_PADDING = 16;

const REGION_COLORS_LIGHT = [
  '#FFFFFF', '#E3F2FD', '#FFF3E0', '#E8F5E9', '#FCE4EC',
  '#F3E5F5', '#E0F7FA', '#FFF9C4', '#EFEBE9', '#E8EAF6',
  '#F1F8E9', '#FBE9E7', '#E0F2F1', '#FFF8E1', '#EDE7F6',
  '#FFEBEE', '#E1F5FE', '#F9FBE7', '#ECEFF1', '#FAFAFA',
  '#E6EE9C', '#FFCCBC', '#B2DFDB', '#D1C4E9', '#F0F4C3',
  '#FFE0B2',
];

const REGION_COLORS_DARK = [
  '#2A2A2A', '#1A237E', '#BF360C', '#1B5E20', '#880E4F',
  '#4A148C', '#006064', '#F57F17', '#3E2723', '#283593',
  '#33691E', '#4E342E', '#004D40', '#FF6F00', '#311B92',
  '#B71C1C', '#01579B', '#827717', '#37474F', '#212121',
  '#9E9D24', '#D84315', '#00695C', '#4527A0', '#689F38',
  '#E65100',
];

export function BoardView({ puzzle, onCellPress }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const theme = useTheme();
  const boardSize = screenWidth - BOARD_PADDING * 2;
  const cellSize = boardSize / puzzle.size;

  const isDark = theme.bg === '#121212';
  const regionPalette = isDark ? REGION_COLORS_DARK : REGION_COLORS_LIGHT;

  const scale = useRef(new Animated.Value(1)).current;
  const baseScale = useRef(1);
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const baseTranslateX = useRef(0);
  const baseTranslateY = useRef(0);

  const pinchRef = useRef<PinchGestureHandler>(null);
  const panRef = useRef<PanGestureHandler>(null);

  const onPinchEvent = Animated.event(
    [{ nativeEvent: { scale: scale } }],
    { useNativeDriver: true },
  );

  const onPinchStateChange = (event: PinchGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      const newScale = Math.max(1, Math.min(baseScale.current * event.nativeEvent.scale, 3));
      baseScale.current = newScale;
      scale.setValue(newScale);
      if (newScale === 1) {
        baseTranslateX.current = 0;
        baseTranslateY.current = 0;
        translateX.setValue(0);
        translateY.setValue(0);
      }
    }
  };

  const onPanEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX, translationY: translateY } }],
    { useNativeDriver: true },
  );

  const onPanStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      baseTranslateX.current += event.nativeEvent.translationX;
      baseTranslateY.current += event.nativeEvent.translationY;
      translateX.setValue(baseTranslateX.current);
      translateY.setValue(baseTranslateY.current);
    }
  };

  const cellData = useMemo(() => {
    const data: { borders: { top: boolean; bottom: boolean; left: boolean; right: boolean }; regionColor: string }[] = [];
    for (let row = 0; row < puzzle.size; row++) {
      for (let col = 0; col < puzzle.size; col++) {
        const region = puzzle.regions[row][col];
        data.push({
          borders: {
            top: row === 0 || puzzle.regions[row - 1][col] !== region,
            bottom: row === puzzle.size - 1 || puzzle.regions[row + 1][col] !== region,
            left: col === 0 || puzzle.regions[row][col - 1] !== region,
            right: col === puzzle.size - 1 || puzzle.regions[row][col + 1] !== region,
          },
          regionColor: regionPalette[region % regionPalette.length],
        });
      }
    }
    return data;
  }, [puzzle, regionPalette]);

  const animatedStyle = {
    transform: [
      { scale },
      { translateX },
      { translateY },
    ],
  };

  return (
    <PinchGestureHandler
      ref={pinchRef}
      onGestureEvent={onPinchEvent}
      onHandlerStateChange={onPinchStateChange}
      simultaneousHandlers={panRef}
    >
      <Animated.View>
        <PanGestureHandler
          ref={panRef}
          onGestureEvent={onPanEvent}
          onHandlerStateChange={onPanStateChange}
          simultaneousHandlers={pinchRef}
          minPointers={2}
          maxPointers={2}
        >
          <Animated.View
            style={[
              styles.board,
              { width: boardSize, height: boardSize },
              animatedStyle,
            ]}
          >
            {cellData.map((cell, i) => {
              const row = Math.floor(i / puzzle.size);
              const col = i % puzzle.size;
              return (
                <CellView
                  key={i}
                  row={row}
                  col={col}
                  size={cellSize}
                  borders={cell.borders}
                  regionColor={cell.regionColor}
                  theme={theme}
                  onPress={onCellPress}
                />
              );
            })}
          </Animated.View>
        </PanGestureHandler>
      </Animated.View>
    </PinchGestureHandler>
  );
}

const styles = StyleSheet.create({
  board: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
