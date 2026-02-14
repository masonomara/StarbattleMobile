import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getAllPacks } from '../packs';
import { useUserStore } from '../stores/userStore';
import {
  SPACING_XS,
  SPACING_MD,
  SPACING_XL,
  RADIUS_MD,
  FONT_SIZE_SM,
  FONT_SIZE_MD,
  FONT_SIZE_LG,
  FONT_WEIGHT_SEMIBOLD,
} from '../utils/constants';
import type { Pack } from '../types/puzzle';
import type { RootStackParams } from '../navigation';
import { useTheme } from '../utils/useTheme';

type Props = NativeStackScreenProps<RootStackParams, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const packs = getAllPacks();
  const theme = useTheme();
  const packProgress = useUserStore(s => s.packProgress);

  const [focusCount, setFocusCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusCount(c => c + 1);
    }, []),
  );

  const renderPack = ({ item }: { item: Pack }) => {
    const total = item.puzzles.length;
    const completed = packProgress[item.id]?.completedCount ?? 0;

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
  };

  return (
    <FlatList
      data={packs}
      extraData={focusCount}
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
  packMeta: { fontSize: FONT_SIZE_SM, marginTop: SPACING_XS },
  packProgress: { fontSize: FONT_SIZE_MD, fontWeight: FONT_WEIGHT_SEMIBOLD },
});
