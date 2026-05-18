import React from 'react';
import { Animated } from 'react-native';
import type { Puzzle } from '../types/puzzle';
import type { Theme } from '../hooks/useTheme';

type Props = {
  puzzle: Puzzle;
  theme: Theme;
  scale: Animated.Value;
  translateX: Animated.Value;
  translateY: Animated.Value;
};

export function BoardView({
  puzzle,
  theme,
  scale,
  translateX,
  translateY,
}: Props) {
  const boardSize = theme.cellSize * puzzle.size;
  return (
    <Animated.View
      style={{
        width: boardSize,
        height: boardSize,
        transform: [{ translateX }, { translateY }, { scale }],
        backgroundColor: theme.card,
      }}
    />
  );
}
