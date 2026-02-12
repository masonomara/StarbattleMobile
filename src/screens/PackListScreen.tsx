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
import type { PackFile } from '../types/puzzle';
import { useTheme } from '../hooks/useTheme';
import { getAllPacks } from '../utils/packs';

type Props = NativeStackScreenProps<RootStackParamList, 'PackList'>;

export default function PackListScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const packs = getAllPacks();

  const renderPack = ({ item }: { item: PackFile }) => (
    <TouchableOpacity
      style={[
        styles.packCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      onPress={() => navigation.navigate('PuzzleSelect', { packId: item.id })}
      activeOpacity={0.7}
    >
      <View style={styles.packInfo}>
        <Text style={[styles.packName, { color: colors.text }]}>
          {item.name}
        </Text>
        <Text style={[styles.packMeta, { color: colors.textSecondary }]}>
          {item.gridSize}x{item.gridSize} &middot; {item.stars}{' '}
          {item.stars === 1 ? 'star' : 'stars'} &middot; {item.puzzles.length}{' '}
          puzzles
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={packs}
        keyExtractor={item => item.id}
        renderItem={renderPack}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  packCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  packInfo: {
    gap: 4,
  },
  packName: {
    fontSize: 17,
    fontWeight: '600',
  },
  packMeta: {
    fontSize: 14,
  },
});
