import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { Star, X } from 'lucide-react-native';
import { usePuzzleStore } from '../store';
import {
  REGION_BORDER_WIDTH,
  INNER_BORDER_WIDTH,
  BORDER_STYLE,
  CELL_SIZE,
  STAR_ICON_SIZE_RATIO,
  MARK_ICON_SIZE_RATIO,
} from '../utils/constants';
import type { Borders } from '../types/puzzle';
import type { Theme } from '../utils/useTheme';

type Props = {
  row: number;
  col: number;
  borders: Borders;
  theme: Theme;
  onPress: (row: number, col: number) => void;
};

export const CellView = memo(function CellView({
  row,
  col,
  borders,
  theme,
  onPress,
}: Props) {
  const { value, hasError } = usePuzzleStore(
    useShallow(s => ({
      value: s.cells[row * s.boardSize + col],
      hasError: s.errorCells.has(`${row},${col}`),
    })),
  );

  const handlePress = useCallback(() => onPress(row, col), [onPress, row, col]);

  const starColor = hasError ? theme.starErrorColor : theme.starColor;

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.cell,
        {
          width: CELL_SIZE,
          height: CELL_SIZE,
          backgroundColor: theme.cellBg,
          borderTopWidth: borders.top
            ? REGION_BORDER_WIDTH
            : INNER_BORDER_WIDTH,
          borderBottomWidth: borders.bottom
            ? REGION_BORDER_WIDTH
            : INNER_BORDER_WIDTH,
          borderLeftWidth: borders.left
            ? REGION_BORDER_WIDTH
            : INNER_BORDER_WIDTH,
          borderRightWidth: borders.right
            ? REGION_BORDER_WIDTH
            : INNER_BORDER_WIDTH,
          borderStyle: BORDER_STYLE,
          borderTopColor: borders.top ? theme.regionBorder : theme.innerBorder,
          borderBottomColor: borders.bottom
            ? theme.regionBorder
            : theme.innerBorder,
          borderLeftColor: borders.left
            ? theme.regionBorder
            : theme.innerBorder,
          borderRightColor: borders.right
            ? theme.regionBorder
            : theme.innerBorder,
        },
      ]}
    >
      {value === 1 && (
        <Text
          style={[
            styles.star,
            { fontSize: CELL_SIZE * STAR_FONT_SIZE_RATIO, color: starColor },
          ]}
        >
          {STAR_SYMBOL}
        </Text>
      )}
      {value === 2 && (
        <Text
          style={[
            styles.mark,
            {
              fontSize: CELL_SIZE * MARK_FONT_SIZE_RATIO,
              color: theme.markColor,
            },
          ]}
        >
          {MARK_SYMBOL}
        </Text>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  star: {
    fontWeight: STAR_FONT_WEIGHT,
  },
  mark: {
    fontWeight: MARK_FONT_WEIGHT,
  },
});
