import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { packs } from '../packs';
import { useUserStore } from '../stores/userStore';
import { Header } from '../components/Header';
import type { Theme } from '../types/theme';
import { useTheme } from '../hooks/useTheme';
import { makePuzzleId } from '../utils/puzzleId';

export function HomeScreen({ navigation }: any) {
  const styles = createStyles(useTheme());
  const completedPuzzles = useUserStore(s => s.completedPuzzles);

  return (
    <View style={styles.container}>
      <Header center={<Text style={styles.title}>Star Battle</Text>} />
      <ScrollView>
        {packs.map(pack => {
          let completed = 0;
          for (let i = 0; i < pack.puzzles.length; i++)
            if (completedPuzzles.has(makePuzzleId(pack.id, i))) completed++;

          return (
            <Pressable
              key={pack.id}
              style={styles.packCard}
              onPress={() => navigation.navigate('Pack', { packId: pack.id })}>
              <View style={styles.packInfo}>
                <Text style={styles.packName}>{pack.name}</Text>
                <Text style={styles.packMeta}>
                  {pack.gridSize}x{pack.gridSize}
                </Text>
              </View>
              <Text style={styles.packProgress}>
                {completed}/{pack.puzzles.length}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
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
