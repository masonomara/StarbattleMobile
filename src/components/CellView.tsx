import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { StarIcon } from './icons/StarIcon';
import { MarkIcon } from './icons/MarkIcon';
import { usePuzzleStore } from '../store';
import { CELL_SIZE, STAR_ICON_SIZE, MARK_ICON_SIZE } from '../utils/constants';
import type { Theme } from '../utils/useTheme';

type Props = {
  row: number;
  col: number;
  theme: Theme;
  onPress: (row: number, col: number) => void;
};

export const CellView = memo(function CellView({
  row,
  col,
  theme,
  onPress,
}: Props) {
  const { value, hasError } = usePuzzleStore(
    useShallow(s => {
      const idx = row * s.puzzle!.size + col;
      return {
        value: s.cells[idx],
        hasError: s.errorCells.has(`${row},${col}`),
      };
    }),
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
        },
      ]}
    >
      {value === 1 && <StarIcon size={STAR_ICON_SIZE} color={starColor} />}
      {value === 2 && (
        <MarkIcon size={MARK_ICON_SIZE} color={theme.markColor} />
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
