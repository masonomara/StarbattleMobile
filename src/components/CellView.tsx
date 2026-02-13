import React, { memo, useCallback } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { usePuzzleStore } from '../store';
import type { Theme } from '../theme';

type Borders = {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
};

type Props = {
  row: number;
  col: number;
  size: number;
  borders: Borders;
  regionColor: string;
  theme: Theme;
  onPress: (row: number, col: number) => void;
};

const REGION_BORDER = 3;
const INNER_BORDER = 1;

export const CellView = memo(function CellView({
  row, col, size, borders, regionColor, theme, onPress,
}: Props) {
  const index = row * usePuzzleStore.getState().boardSize + col;
  const value = usePuzzleStore(s => s.cells[index]);
  const hasError = usePuzzleStore(s => s.errorCells.has(index));

  const handlePress = useCallback(() => onPress(row, col), [onPress, row, col]);

  const bgColor = hasError ? theme.error : regionColor;

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.cell,
        {
          width: size,
          height: size,
          backgroundColor: bgColor,
          borderTopWidth: borders.top ? REGION_BORDER : INNER_BORDER,
          borderBottomWidth: borders.bottom ? REGION_BORDER : INNER_BORDER,
          borderLeftWidth: borders.left ? REGION_BORDER : INNER_BORDER,
          borderRightWidth: borders.right ? REGION_BORDER : INNER_BORDER,
          borderTopColor: borders.top ? theme.regionBorder : theme.innerBorder,
          borderBottomColor: borders.bottom ? theme.regionBorder : theme.innerBorder,
          borderLeftColor: borders.left ? theme.regionBorder : theme.innerBorder,
          borderRightColor: borders.right ? theme.regionBorder : theme.innerBorder,
        },
      ]}
    >
      {value === 1 && (
        <Text style={[styles.star, { fontSize: size * 0.5, color: theme.starColor }]}>★</Text>
      )}
      {value === 2 && (
        <Text style={[styles.mark, { fontSize: size * 0.4, color: theme.markColor }]}>✕</Text>
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
    fontWeight: '700',
  },
  mark: {
    fontWeight: '300',
  },
});
