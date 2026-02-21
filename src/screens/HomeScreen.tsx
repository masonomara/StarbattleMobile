import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { packs } from '../packs';
import { useUserStore } from '../stores/userStore';
import { Header } from '../components/Header';
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
  styles: any;
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
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <Header center={<Text style={styles.title}>Star Battle</Text>} />
      <FlatList
        data={packs}
        keyExtractor={p => p.id}
        renderItem={({ item }) => (
          <PackCard
            pack={item}
            onPress={packId => navigation.navigate('Pack', { packId })}
            styles={styles}
          />
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
      fontSize: theme.fontSizeLg,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    list: { padding: 0 },
    packCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: theme.spacingXl,
      borderRadius: theme.radiusMd,
      marginBottom: theme.spacingMd,
      backgroundColor: theme.card,
      shadowColor: theme.shadow,
    },
    packInfo: { flex: 1 },
    packName: {
      fontSize: theme.fontSizeLg,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    packMeta: {
      fontSize: theme.fontSizeSm,
      marginTop: 4,
      color: theme.textSecondary,
    },
    packProgress: {
      fontSize: theme.fontSizeMd,
      fontWeight: theme.fontWeightSemibold,
      color: theme.accent,
    },
  });
