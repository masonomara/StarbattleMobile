import React, { useState, useEffect } from 'react';
import { Modal, View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Text } from '../components/Text';
import { X, Lock, ChevronRight } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Header } from '../components/Header';
import { useSettingsStore } from '../stores/settingsStore';
import { useStreaksStore } from '../stores/streaksStore';
import { useTheme } from '../hooks/useTheme';
import { useEntitlements } from '../hooks/useEntitlements';
import { useProductPrice } from '../hooks/useProductPrice';
import { loadStreaks, getPastArchive } from '../utils/progress';
import {
  getCurrentKey,
  getActiveStreak,
  STREAK_TYPES,
  STREAK_LABELS,
} from '../utils/streakDate';
import type { Theme, StreakType, Streak, RootStackParamList } from '../types';

type ArchiveEntry = { dateKey: string; puzzleId: string };

export function StreaksModal() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { entitlements } = useEntitlements();
  const isPremium = entitlements.isPremium;
  const premiumPrice = useProductPrice('sb_premium_599');

  const streaksModalVisible = useStreaksStore(s => s.streaksModalVisible);
  const closeStreaks = useStreaksStore(s => s.closeStreaks);

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [archiveByType, setArchiveByType] = useState<
    Record<StreakType, ArchiveEntry[]>
  >({ daily: [], weekly: [], monthly: [] });
  const [activeTab, setActiveTab] = useState<StreakType>('daily');

  useEffect(() => {
    if (!streaksModalVisible) return;
    async function load() {
      const rawStreaks = await loadStreaks();
      setStreaks(rawStreaks);

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
  }, [isPremium, streaksModalVisible]);

  return (
    <Modal
      visible={streaksModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeStreaks}
    >
      <View style={styles.container}>
        <Header
          absolute={false}
          center={<Text style={styles.headerTitle}>Streaks</Text>}
          right={
            <Pressable onPress={closeStreaks} hitSlop={8}>
              <X size={24} color={theme.text} />
            </Pressable>
          }
        />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.streakGrid}>
            {STREAK_TYPES.map((type, i) => {
              const found = streaks.find(s => s.type === type);
              const count = found ? getActiveStreak(found, type) : 0;
              return (
                <View
                  key={type}
                  style={[
                    styles.streakTile,
                    { backgroundColor: STREAK_TILE_COLORS[i] },
                  ]}
                >
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
                    onPress={() => {
                      closeStreaks();
                      navigation.navigate('Puzzle', {
                        streakType: activeTab,
                        archiveOptions: {
                          isArchive: true,
                          archiveKey: entry.dateKey,
                        },
                      });
                    }}
                  >
                    <Text style={styles.archiveDate}>{entry.dateKey}</Text>
                    <ChevronRight size={18} color={theme.textSecondary} />
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
                  {premiumPrice
                    ? `Unlock with Premium · ${premiumPrice}`
                    : 'Unlock with Premium'}
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const STREAK_TILE_COLORS = ['#8FD6AE', '#81D0E7', '#D3C2FA'];

const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: theme.spacingXl,
      backgroundColor: theme.textSecondary,
    },
    scrollContent: {
      paddingHorizontal: theme.spacingXl,
      paddingBottom: theme.spacingXl,
    },
    headerTitle: {
      fontSize: theme.fontSizeBody,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    streakGrid: {
      flexDirection: 'row',
      gap: theme.spacingMd,
      marginBottom: theme.spacingXl,
      marginTop: theme.spacingLg,
    },
    streakTile: {
      flex: 1,
      borderRadius: theme.radiusMd,
      padding: theme.spacingLg,
      alignItems: 'center',
      shadowOffset: { width: 0, height: 4 },
      shadowColor: '#25292E',
      shadowOpacity: 0.1,
      shadowRadius: 24,
      elevation: 8,
    },
    streakCount: {
      lineHeight: 36,
      fontSize: 33,
      fontWeight: 900,
      color: theme.blue,
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
      backgroundColor: theme.background,
    },
    tabActive: {
      backgroundColor: theme.blue,
    },
    tabText: {
      fontSize: theme.fontSizeSubhead,
      fontWeight: theme.fontWeightSemibold,
      color: theme.textSecondary,
    },
    tabTextActive: {
      color: theme.background,
    },
    archiveRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: theme.spacingLg,
      paddingHorizontal: theme.spacingXl,
      borderRadius: theme.radiusMd,
      backgroundColor: theme.background,
      marginBottom: theme.spacingMd,
    },
    archiveDate: {
      fontSize: theme.fontSizeCallout,
      color: theme.text,
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
      backgroundColor: theme.background,
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
      backgroundColor: theme.blue,
      marginTop: theme.spacingMd,
    },
    upgradeButtonText: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: theme.background,
    },
  });
};
