import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { useTheme } from '../hooks/useTheme';
import { getPackById } from '../utils/packs';

type Props = NativeStackScreenProps<RootStackParamList, 'Puzzle'>;

export default function PuzzleScreen({ route }: Props) {
  const { colors } = useTheme();
  const { packId, puzzleIndex } = route.params;
  const pack = getPackById(packId);
  const puzzle = pack?.puzzles[puzzleIndex];

  if (!pack || !puzzle) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>
          Puzzle not found
        </Text>
      </View>
    );
  }

  const sbnHeader = puzzle.sbn.split('.')[0];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.text }]}>
          {pack.name} #{puzzleIndex + 1}
        </Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {sbnHeader} &middot; {puzzle.hints.length} hints available
        </Text>
      </View>

      <View style={[styles.boardPlaceholder, { borderColor: colors.border }]}>
        <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
          Board renderer goes here
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  info: {
    padding: 16,
    gap: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  meta: {
    fontSize: 14,
  },
  boardPlaceholder: {
    flex: 1,
    margin: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 32,
  },
});
