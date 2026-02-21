import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { packs } from '../packs';
import { useUserStore } from '../stores/userStore';
import { Header } from '../components/Header';
import { useTheme, type Theme } from '../hooks/useTheme';

export function HomeScreen({ navigation }: any) {
  const styles = createStyles(useTheme());
  const completedPerPack = useUserStore(s => s.progress.completedPerPack);

  return (
    <View style={styles.container}>
      <Header center={<Text style={styles.title}>Star Battle</Text>} />
      <ScrollView>
        {packs.map(pack => (
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
              {completedPerPack[pack.id] ?? 0}/{pack.puzzles.length}
            </Text>
          </Pressable>
        ))}
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
