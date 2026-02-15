import React, { useMemo } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { CellView } from './CellView';
import { CellGridSvg } from './CellGridSvg';
import { RegionBordersSvg } from './RegionBordersSvg';
import { usePuzzleStore } from '../store';
import type { Puzzle } from '../types/puzzle';
import { CELL_SIZE } from '../utils/constants';
import { useTheme } from '../hooks/useTheme';

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

  const cells = useMemo(
    () => Array.from({ length: puzzle.size * puzzle.size }, (_, i) => i),
    [puzzle.size],
  );

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
      {cells.map(i => {
        const row = Math.floor(i / puzzle.size);
        const col = i % puzzle.size;
        return (
          <CellView
            key={i}
            row={row}
            col={col}
            theme={theme}
            onPress={tapCell}
          />
        );
      })}
      <CellGridSvg size={puzzle.size} theme={theme} />

      <RegionBordersSvg
        size={puzzle.size}
        regions={puzzle.regions}
        theme={theme}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  board: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
