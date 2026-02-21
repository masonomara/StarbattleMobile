import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { useShallow } from 'zustand/react/shallow';
import { usePuzzleStore } from '../store';
import type { Theme } from '../hooks/useTheme';

const STAR_PATH =
  'M36 2.18L44.47 25.1H68.76L49.14 39.9L57.62 62.82L36 48.02L14.38 62.82L22.86 39.9L3.24 25.1H27.53Z';

function Star({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 72 72">
      <Path d={STAR_PATH} fill={color} />
    </Svg>
  );
}

function Mark({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Line x1={6} y1={6} x2={18} y2={18} stroke={color} strokeWidth={3} />
      <Line x1={18} y1={6} x2={6} y2={18} stroke={color} strokeWidth={3} />
    </Svg>
  );
}

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
          width: theme.cellSize,
          height: theme.cellSize,
          backgroundColor: theme.bg,
        },
      ]}
    >
      {value === 1 && <Star color={regionBorder} />}
      {value === 2 && <Mark color={theme.markColor} />}
      {ghost === 'star' && value !== 1 && (
        <View style={styles.ghost}>
          <Star color={theme.regionBorder} />
        </View>
      )}
      {ghost === 'mark' && value !== 2 && (
        <View style={styles.ghost}>
          <Mark color={theme.markColor} />
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
