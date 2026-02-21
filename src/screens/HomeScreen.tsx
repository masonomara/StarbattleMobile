import React, { memo, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getAllPacks } from '../packs';
import { useUserStore } from '../stores/userStore';
import { Header } from '../components/Header';
import {
  SPACING_MD,
  SPACING_XL,
  RADIUS_MD,
  FONT_SIZE_SM,
  FONT_SIZE_MD,
  FONT_SIZE_LG,
  FONT_WEIGHT_SEMIBOLD,
} from '../utils/constants';
import type { Pack } from '../types/puzzle';
import type { RootStackParams } from '../types/navigation';
import { useTheme } from '../hooks/useTheme';
import { makePuzzleId } from '../utils/puzzleId';

type Props = NativeStackScreenProps<RootStackParams, 'Home'>;

const PackCard = memo(function PackCard({
  pack,
  onPress,
}: {
  pack: Pack;
  onPress: (packId: string) => void;
}) {
  const theme = useTheme();
  const total = pack.puzzles.length;
  const completed = useUserStore(s => {
    let count = 0;
    for (let i = 0; i < total; i++) {
      if (s.completedPuzzles.has(makePuzzleId(pack.id, i))) count++;
    }
    return count;
  });

  return (
    <Pressable
      style={[
        styles.packCard,
        { backgroundColor: theme.card, shadowColor: theme.shadow },
      ]}
      onPress={() => onPress(pack.id)}
    >
      <View style={styles.packInfo}>
        <Text style={[styles.packName, { color: theme.text }]}>
          {pack.name}
        </Text>
        <Text style={[styles.packMeta, { color: theme.textSecondary }]}>
          {pack.gridSize}x{pack.gridSize}
        </Text>
      </View>
      <Text style={[styles.packProgress, { color: theme.accent }]}>
        {completed}/{total}
      </Text>
    </Pressable>
  );
});

export function HomeScreen({ navigation }: Props) {
  const packs = getAllPacks();
  const theme = useTheme();

  const handlePress = useCallback(
    (packId: string) => {
      navigation.navigate('Pack', { packId });
    },
    [navigation],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Header
        center={
          <Text style={[styles.title, { color: theme.text }]}>Star Battle</Text>
        }
      />
      <FlatList
        data={packs}
        keyExtractor={p => p.id}
        renderItem={({ item }) => (
          <PackCard pack={item} onPress={handlePress} />
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: FONT_SIZE_LG, fontWeight: FONT_WEIGHT_SEMIBOLD },
  list: { padding: 0 },
  packCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING_XL,
    borderRadius: RADIUS_MD,
    marginBottom: SPACING_MD,
  },
  packInfo: { flex: 1 },
  packName: { fontSize: FONT_SIZE_LG, fontWeight: FONT_WEIGHT_SEMIBOLD },
  packMeta: { fontSize: FONT_SIZE_SM, marginTop: 4 },
  packProgress: { fontSize: FONT_SIZE_MD, fontWeight: FONT_WEIGHT_SEMIBOLD },
});
