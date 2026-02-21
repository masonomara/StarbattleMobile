import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { StarIcon } from './icons/StarIcon';
import { MarkIcon } from './icons/MarkIcon';
import { usePuzzleStore } from '../store';
import { CELL_SIZE } from '../utils/constants';
import type { Theme } from '../types/theme';

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
  const { value, hasError, ghost } = usePuzzleStore(
    useShallow(s => {
      const idx = row * s.puzzle!.size + col;
      return {
        value: s.cells[idx],
        hasError: s.errorCells.has(idx),
        ghost: s.hintGhosts.get(idx) ?? null,
      };
    }),
  );

  const handlePress = useCallback(() => onPress(row, col), [onPress, row, col]);

  const regionBorder = hasError ? theme.markColor : theme.regionBorder;

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.cell,
        {
          width: CELL_SIZE,
          height: CELL_SIZE,
          backgroundColor: theme.bg,
        },
      ]}
    >
      {value === 1 && <StarIcon size={22} color={regionBorder} />}
      {value === 2 && <MarkIcon size={14} color={theme.markColor} />}
      {ghost === 'star' && value !== 1 && (
        <View style={styles.ghost}>
          <StarIcon size={22} color={theme.regionBorder} />
        </View>
      )}
      {ghost === 'mark' && value !== 2 && (
        <View style={styles.ghost}>
          <MarkIcon size={14} color={theme.markColor} />
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: {
    position: 'absolute',
    opacity: 0.3,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
});
