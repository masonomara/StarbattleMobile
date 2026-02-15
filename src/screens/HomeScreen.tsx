import React, { useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getAllPacks } from '../packs';
import { useUserStore } from '../stores/userStore';
import { computeCompletedCount } from '../storage';
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

type Props = NativeStackScreenProps<RootStackParams, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const packs = getAllPacks();
  const theme = useTheme();
  const progressVersion = useUserStore(s => s.progressVersion);

  const renderPack = useCallback(({ item }: { item: Pack }) => {
    const total = item.puzzles.length;
    const completed = computeCompletedCount(item.id, total);

    return (
      <Pressable
        style={[
          styles.packCard,
          { backgroundColor: theme.card, shadowColor: theme.shadow },
        ]}
        onPress={() => navigation.navigate('Pack', { packId: item.id })}
      >
        <View style={styles.packInfo}>
          <Text style={[styles.packName, { color: theme.text }]}>
            {item.name}
          </Text>
          <Text style={[styles.packMeta, { color: theme.textSecondary }]}>
            {item.gridSize}x{item.gridSize}
          </Text>
        </View>
        <Text style={[styles.packProgress, { color: theme.accent }]}>
          {completed}/{total}
        </Text>
      </Pressable>
    );
  }, [theme, navigation]);

  return (
    <FlatList
      data={packs}
      extraData={progressVersion}
      keyExtractor={p => p.id}
      renderItem={renderPack}
      contentContainerStyle={styles.list}
      style={{ backgroundColor: theme.bg }}
    />
  );
}

const styles = StyleSheet.create({
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
