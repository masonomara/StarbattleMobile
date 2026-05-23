import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChevronLeft, Lock } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import { useSettingsStore } from '../stores/settingsStore';
import { useTheme } from '../hooks/useTheme';
import { useEntitlements } from '../hooks/useEntitlements';
import { loadStreaks } from '../utils/progress';
import {
  getCurrentKey,
  getActiveStreak,
  getPastArchive,
  STREAK_TYPES,
  STREAK_LABELS,
} from '../utils/streakDate';
import type { Theme } from '../types/theme';
import type { StreakType, Streak } from '../types/state';
import type { RootStackParamList } from '../types/navigation';

type ArchiveEntry = { dateKey: string; puzzleId: string };

export function StreaksScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Streaks'>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme);
  const { entitlements } = useEntitlements();
  const isPremium = entitlements.isPremium;

  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [archiveByType, setArchiveByType] = useState<
    Record<StreakType, ArchiveEntry[]>
  >({ daily: [], weekly: [], monthly: [] });
  const [activeTab, setActiveTab] = useState<StreakType>('daily');

  useEffect(() => {
    async function load() {
      setStreaks(await loadStreaks());

      if (isPremium) {
        const results: Record<StreakType, ArchiveEntry[]> = {
          daily: [],
          weekly: [],
          monthly: [],
        };
        await Promise.all(
          STREAK_TYPES.map(async type => {
            results[type] = await getPastArchive(type, getCurrentKey(type));
          }),
        );
        setArchiveByType(results);
      }
    }
    load();
  }, [isPremium]);

  return (
    <View style={styles.container}>
      <Header
        left={
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={8}
          >
            <ChevronLeft size={26} color={theme.text} />
          </Pressable>
        }
        center={<Text style={styles.headerTitle}>Streaks</Text>}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 48 + insets.top, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View style={styles.streakGrid}>
          {STREAK_TYPES.map(type => {
            const found = streaks.find(s => s.type === type);
            const count = found ? getActiveStreak(found, type) : 0;
            return (
              <View key={type} style={styles.streakTile}>
                <Text style={styles.streakCount}>{count}</Text>
                <Text style={styles.streakLabel}>{STREAK_LABELS[type]}</Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Past Puzzles</Text>

        {isPremium ? (
          <>
            <View style={styles.tabRow}>
              {STREAK_TYPES.map(type => (
                <Pressable
                  key={type}
                  style={[styles.tab, activeTab === type && styles.tabActive]}
                  onPress={() => setActiveTab(type)}
                >
                  <Text
                    style={[
                      styles.tabText,
                      activeTab === type && styles.tabTextActive,
                    ]}
                  >
                    {STREAK_LABELS[type]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {archiveByType[activeTab].length === 0 ? (
              <Text style={styles.emptyText}>No past puzzles yet.</Text>
            ) : (
              archiveByType[activeTab].map(entry => (
                <Pressable
                  key={entry.dateKey}
                  style={styles.archiveRow}
                  onPress={() =>
                    navigation.navigate('Puzzle', {
                      streakType: activeTab,
                      isArchive: true,
                      archiveKey: entry.dateKey,
                    })
                  }
                >
                  <Text style={styles.archiveDate}>{entry.dateKey}</Text>
                  <ChevronLeft
                    size={18}
                    color={theme.textSecondary}
                    style={styles.archiveChevron}
                  />
                </Pressable>
              ))
            )}
          </>
        ) : (
          <View style={styles.premiumTeaser}>
            <Lock size={28} color={theme.textSecondary} />
            <Text style={styles.teaserTitle}>Premium Feature</Text>
            <Text style={styles.teaserBody}>
              Unlock access to every past daily, weekly, and monthly puzzle.
            </Text>
            <Pressable
              style={styles.upgradeButton}
              onPress={() => useSettingsStore.getState().openSettings()}
            >
              <Text style={styles.upgradeButtonText}>
                Unlock with Premium · $5.99
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scrollContent: {
      paddingHorizontal: theme.spacingXl,
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.card,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 8,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
    },
    streakGrid: {
      flexDirection: 'row',
      gap: theme.spacingMd,
      marginBottom: theme.spacingXl,
    },
    streakTile: {
      flex: 1,
      backgroundColor: theme.card,
      borderRadius: theme.radiusMd,
      padding: theme.spacingLg,
      alignItems: 'center',
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 1,
      shadowRadius: 4,
      elevation: 2,
    },
    streakCount: {
      fontSize: 32,
      fontWeight: theme.fontWeightSemibold,
      color: theme.accent,
    },
    streakLabel: {
      fontSize: theme.fontSizeSubhead,
      color: theme.textSecondary,
      marginTop: 4,
    },
    sectionTitle: {
      fontSize: theme.fontSizeBody,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
      marginBottom: theme.spacingLg,
    },
    tabRow: {
      flexDirection: 'row',
      gap: theme.spacingMd,
      marginBottom: theme.spacingLg,
    },
    tab: {
      flex: 1,
      paddingVertical: theme.spacingMd,
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      backgroundColor: theme.highlight,
    },
    tabActive: {
      backgroundColor: theme.accent,
    },
    tabText: {
      fontSize: theme.fontSizeSubhead,
      fontWeight: theme.fontWeightSemibold,
      color: theme.textSecondary,
    },
    tabTextActive: {
      color: theme.onAccent,
    },
    archiveRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: theme.spacingLg,
      paddingHorizontal: theme.spacingXl,
      borderRadius: theme.radiusMd,
      backgroundColor: theme.card,
      marginBottom: theme.spacingMd,
    },
    archiveDate: {
      fontSize: theme.fontSizeCallout,
      color: theme.text,
    },
    archiveChevron: {
      transform: [{ rotate: '180deg' }],
    },
    emptyText: {
      fontSize: theme.fontSizeCallout,
      color: theme.textSecondary,
      textAlign: 'center',
      marginTop: theme.spacingXl,
    },
    premiumTeaser: {
      alignItems: 'center',
      padding: theme.spacingXl,
      borderRadius: theme.radiusMd,
      backgroundColor: theme.card,
      gap: theme.spacingMd,
    },
    teaserTitle: {
      fontSize: theme.fontSizeBody,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    teaserBody: {
      fontSize: theme.fontSizeCallout,
      color: theme.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    upgradeButton: {
      height: 52,
      width: '100%',
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.accent,
      marginTop: theme.spacingMd,
    },
    upgradeButtonText: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: theme.onAccent,
    },
  });
