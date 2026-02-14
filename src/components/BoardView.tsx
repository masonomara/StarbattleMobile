import React, { useMemo } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { CellView } from './CellView';
import { usePuzzleStore } from '../store';

import type { Puzzle, Borders } from '../types/puzzle';
import { CELL_SIZE, REGION_BORDER_WIDTH } from '../utils/constants';
import { useTheme } from '../utils/useTheme';

type Props = {
  puzzle: Puzzle;
  scale: Animated.Value;
  translateX: Animated.Value;
  translateY: Animated.Value;
};

export function BoardView({ puzzle, scale, translateX, translateY }: Props) {
  const theme = useTheme();
  const tapCell = usePuzzleStore(s => s.tapCell);
  const boardSize = CELL_SIZE * puzzle.size;

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
  );
}

const styles = StyleSheet.create({
  board: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    outlineWidth: REGION_BORDER_WIDTH,
  },
});
