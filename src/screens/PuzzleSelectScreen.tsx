import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { useTheme } from '../hooks/useTheme';
import { getPackById } from '../utils/packs';

type Props = NativeStackScreenProps<RootStackParamList, 'PuzzleSelect'>;

export default function PuzzleSelectScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { packId } = route.params;
  const pack = getPackById(packId);

  if (!pack) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>
          Pack not found
        </Text>
      </View>
    );
  }

  const puzzleIndices = pack.puzzles.map((_, i) => i);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={puzzleIndices}
        keyExtractor={item => String(item)}
        numColumns={5}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        renderItem={({ item: index }) => (
          <TouchableOpacity
            style={[
              styles.cell,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={() =>
              navigation.navigate('Puzzle', { packId, puzzleIndex: index })
            }
            activeOpacity={0.7}
          >
            <Text style={[styles.cellText, { color: colors.text }]}>
              {index + 1}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  grid: {
    padding: 16,
  },
  row: {
    gap: 8,
    marginBottom: 8,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: '18%',
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 32,
  },
});
