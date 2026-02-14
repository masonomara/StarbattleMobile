import React, { useCallback, useState } from 'react';
import { Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getPack } from '../packs';
import { getProgress } from '../storage';
import {
  SPACING_SM,
  SPACING_LG,
  RADIUS_SM,
  FONT_SIZE_LG,
  FONT_WEIGHT_SEMIBOLD,
  GRID_COLUMNS,
  SHADOW_SM,
} from '../utils/constants';
import type { RootStackParams } from '../navigation';
import type { RawPuzzle } from '../types/puzzle';
import { useTheme } from '../utils/useTheme';

type Props = NativeStackScreenProps<RootStackParams, 'Pack'>;

export function PackScreen({ route, navigation }: Props) {
  const { packId } = route.params;
  const pack = getPack(packId);
  const theme = useTheme();

  const [focusCount, setFocusCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusCount(c => c + 1);
    }, []),
  );

  React.useEffect(() => {
    if (pack) navigation.setOptions({ title: pack.name });
  }, [pack, navigation]);

  if (!pack) return null;

  const renderPuzzle = ({
    item: _item,
    index,
  }: {
    item: RawPuzzle;
    index: number;
  }) => {
    const puzzleId = `${packId}:${index}`;
    const progress = getProgress(puzzleId);
    const isCompleted = progress?.completed ?? false;

    return (
      <Pressable
        style={[
          styles.puzzleCell,
          {
            backgroundColor: isCompleted ? theme.accentMuted : theme.card,
            shadowColor: theme.shadow,
          },
        ]}
        onPress={() =>
          navigation.navigate('Puzzle', { packId, puzzleIndex: index })
        }
      >
        <Text
          style={[
            styles.puzzleNumber,
            { color: isCompleted ? theme.accent : theme.text },
          ]}
        >
          {index + 1}
        </Text>
      </Pressable>
    );
  };

  return (
    <FlatList
      data={pack.puzzles}
      extraData={focusCount}
      keyExtractor={(_, i) => String(i)}
      renderItem={renderPuzzle}
      numColumns={GRID_COLUMNS}
      contentContainerStyle={styles.grid}
      style={{ backgroundColor: theme.bg }}
    />
  );
}

const styles = StyleSheet.create({
  grid: { padding: SPACING_LG },
  puzzleCell: {
    flex: 1,
    aspectRatio: 1,
    margin: SPACING_SM,
    borderRadius: RADIUS_SM,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW_SM,
  },
  puzzleNumber: { fontSize: FONT_SIZE_LG, fontWeight: FONT_WEIGHT_SEMIBOLD },
});
