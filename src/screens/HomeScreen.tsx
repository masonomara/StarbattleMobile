import React, { useCallback, useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
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
import type { Theme } from '../types/theme';
import { useTheme } from '../hooks/useTheme';
import { makePuzzleId } from '../utils/puzzleId';

function PackCard({
  pack,
  onPress,
  styles,
}: {
  pack: Pack;
  onPress: (packId: string) => void;
  styles: ReturnType<typeof createStyles>;

  // thsi return type is very ugly, do we truly need a return type? cant we just rawdawg the types?
}) {
  const total = pack.puzzles.length;
  const completed = useUserStore(s => {
    let count = 0;
    for (let i = 0; i < total; i++) {
      if (s.completedPuzzles.has(makePuzzleId(pack.id, i))) count++;
    }
    return count;
  });

  return (
    <Pressable style={styles.packCard} onPress={() => onPress(pack.id)}>
      <View style={styles.packInfo}>
        <Text style={styles.packName}>{pack.name}</Text>
        <Text style={styles.packMeta}>
          {pack.gridSize}x{pack.gridSize}
        </Text>
      </View>
      <Text style={styles.packProgress}>
        {completed}/{total}
      </Text>
    </Pressable>
  );
}

export function HomeScreen({ navigation }: any) {
  const packs = getAllPacks();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);


  // we're not using useMemo for stylinhg - if we nee someone tfor dark mode we can run it in a context fol eor soething - i dont think we need it jsut for one function
  const handlePress = useCallback(
    (packId: string) => {
      navigation.navigate('Pack', { packId });
    },
    [navigation],
  );

  return (
    <View style={styles.container}>
      <Header center={<Text style={styles.title}>Star Battle</Text>} />
      <FlatList
        data={packs}
        keyExtractor={p => p.id}
        renderItem={({ item }) => (
          <PackCard pack={item} onPress={handlePress} styles={styles} />
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    title: {
      fontSize: FONT_SIZE_LG,
      fontWeight: FONT_WEIGHT_SEMIBOLD,
      color: theme.text,
    },
    list: { padding: 0 },
    packCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: SPACING_XL,
      borderRadius: RADIUS_MD,
      marginBottom: SPACING_MD,
      backgroundColor: theme.card,
      shadowColor: theme.shadow,
    },
    packInfo: { flex: 1 },
    packName: {
      fontSize: FONT_SIZE_LG,
      fontWeight: FONT_WEIGHT_SEMIBOLD,
      color: theme.text,
    },
    packMeta: {
      fontSize: FONT_SIZE_SM,
      marginTop: 4,
      color: theme.textSecondary,
    },
    packProgress: {
      fontSize: FONT_SIZE_MD,
      fontWeight: FONT_WEIGHT_SEMIBOLD,
      color: theme.accent,
    },
  });
