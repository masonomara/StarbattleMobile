// CONCERN: The premium lock for archive access uses an Alert to redirect to
// Settings. Consider a dedicated PaywallModal context variant instead of an
// Alert so the UX is consistent with the rest of the paywall flows.
import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { Text } from '../../shared/ui/Text';
import { PackCard } from './PackCard';
import X from 'lucide-react-native/dist/cjs/icons/x';
import Lock from 'lucide-react-native/dist/cjs/icons/lock';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSettingsStore } from '../../stores/settingsStore';
import { useStreaksStore } from '../../stores/streaksStore';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../shared/theme/useTheme';
import { useEntitlements } from '../../hooks/useEntitlements';
import { useStreakRows } from '../../hooks/useStreakRows';
import { getStreakPack } from '../../packs';
import { parsePuzzle } from '../../utils/parsePuzzle';
import { loadAllCompletionData } from '../../utils/progress';
import {
  getActiveStreak,
  getPuzzleIndex,
  getPastDateKeys,
  archiveKeyToDate,
  STREAK_TYPES,
  STREAK_LABELS,
  STREAK_UNIT,
} from '../../utils/streakDate';
import type { Theme, StreakType, Puzzle, RootStackParamList } from '../../types';

const ARCHIVE_NAMES: Record<StreakType, string> = {
  daily: 'Daily Challenge',
  weekly: 'Weekly Challenge',
  monthly: 'Monthly Challenge',
};

export function StreaksModal() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const coloredRegions = useSettingsStore(s => s.settings.coloredRegions);
  const streaksModalVisible = useStreaksStore(s => s.streaksModalVisible);
  const closeStreaks = useStreaksStore(s => s.closeStreaks);
  const { entitlements } = useEntitlements();
  const isPremium = entitlements.isPremium;

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const userId = useAuthStore(s => s.user?.id);
  const { streaks } = useStreakRows(userId);

  const [scrolled, setScrolled] = useState(false);
  // Past archive date keys per type. Computed once per mount — the values only
  // change at the midnight rollover, which doesn't matter within a session.
  const keysByType = useMemo<Record<StreakType, string[]>>(
    () => ({
      daily: getPastDateKeys('daily'),
      weekly: getPastDateKeys('weekly'),
      monthly: getPastDateKeys('monthly'),
    }),
    [],
  );
  const archiveCounts: Record<StreakType, number> = {
    daily: keysByType.daily.length,
    weekly: keysByType.weekly.length,
    monthly: keysByType.monthly.length,
  };
  const [thumbnails, setThumbnails] = useState<
    Partial<Record<StreakType, Puzzle>>
  >({});
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!streaksModalVisible) return;
    loadAllCompletionData().then(setCompletedIds);
  }, [streaksModalVisible]);

  useEffect(() => {
    if (!streaksModalVisible) return;

    async function loadThumbnails() {
      const thumbResults: Partial<Record<StreakType, Puzzle>> = {};
      await Promise.all(
        STREAK_TYPES.map(async type => {
          try {
            const pack = await getStreakPack(type);
            if (!pack) return;
            const recentKey = keysByType[type][0];
            const date = recentKey
              ? archiveKeyToDate(type, recentKey)
              : new Date();
            const idx = getPuzzleIndex(type, pack.puzzles.length, date);
            thumbResults[type] = parsePuzzle(
              pack.puzzles[idx],
              `${type}:thumb`,
            );
          } catch {}
        }),
      );
      setThumbnails(thumbResults);
    }

    loadThumbnails();
  }, [streaksModalVisible, keysByType]);

  return (
    <Modal
      visible={streaksModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeStreaks}
    >
      <View style={styles.container}>
        <View
          style={[styles.modalHeader, scrolled && styles.modalHeaderBorder]}
        >
          <View style={styles.modalHeaderSide} />
          <View style={styles.modalHeaderCenter}>
            <Text role="largeTitle" style={styles.headerTitle}>Streaks</Text>
          </View>
          <View style={styles.modalHeaderSide}>
            <Pressable onPress={closeStreaks} hitSlop={8}>
              <X size={24} color={theme.text} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          onScroll={e => setScrolled(e.nativeEvent.contentOffset.y > 0)}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.streakGrid}>
            {STREAK_TYPES.map(type => {
              const found = streaks.find(s => s.type === type);
              const current = found ? getActiveStreak(found, type) : 0;
              const best = found ? found.best : 0;
              const unit = (n: number) =>
                n === 1 ? STREAK_UNIT[type] : `${STREAK_UNIT[type]}s`;
              return (
                <View key={type} style={[styles.streakTile]}>
                  <Text role="headline" style={styles.streakLabel}>{STREAK_LABELS[type]}</Text>
                  <View style={styles.streakStatRow}>
                    <Text role="subhead" style={styles.streakStatLabel}>Best</Text>
                    <Text role="body" style={styles.streakStatValue}>
                      {best} {unit(best)}
                    </Text>
                  </View>
                  <View style={styles.streakStatRow}>
                    <Text role="subhead" style={styles.streakStatLabel}>Current</Text>
                    <Text role="body" style={styles.streakStatValue}>
                      {current} {unit(current)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          <Text role="headline" style={styles.sectionTitle}>Archived Challenges</Text>

          {STREAK_TYPES.map(type => {
            const count = archiveCounts[type];
            const done = keysByType[type].filter(k =>
              completedIds.has(`${type}:archive:${k}`),
            ).length;
            const preview = thumbnails[type];
            const isEmpty = count === 0;
            const locked = !isPremium;
            return (
              <PackCard
                key={type}
                name={ARCHIVE_NAMES[type]}
                meta={isEmpty ? 'Coming soon' : `${done} of ${count} completed`}
                preview={preview}
                disabled={isEmpty}
                onPress={() => {
                  if (locked) {
                    Alert.alert(
                      'Premium Feature',
                      'Upgrade to Premium to access past challenges.',
                      [
                        { text: 'Not Now', style: 'cancel' },
                        {
                          text: 'Upgrade',
                          onPress: () =>
                            useSettingsStore.getState().openSettings(),
                        },
                      ],
                    );
                  } else {
                    closeStreaks();
                    navigation.navigate('ArchivePack', { type });
                  }
                }}
                right={
                  locked ? (
                    <Lock
                      size={19}
                      color={theme.textSecondary}
                      strokeWidth={2.5}
                    />
                  ) : undefined
                }
                theme={theme}
                coloredRegions={coloredRegions}
              />
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    container: {
      flex: 1,

      backgroundColor: theme.background,
    },
    scrollContent: {
      paddingHorizontal: theme.spacingXl,
      paddingBottom: theme.spacingXl,
      backgroundColor: theme.background,
    },
    modalHeader: {
      height: 80,
      paddingTop: 24,
      paddingBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'transparent',
    },
    modalHeaderBorder: {
      borderBottomColor: theme.border,
    },
    modalHeaderSide: {
      width: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalHeaderCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      color: theme.text,
    },
    streakGrid: {
      flexDirection: 'row',
      gap: theme.spacingMd,
      marginTop: 16,
    },
    streakTile: {
      flex: 1,
      padding: 14,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
    },
    streakLabel: {
      color: theme.text,
    },
    streakStatRow: {
      marginTop: 8,
    },
    streakStatLabel: {
      color: theme.textSecondary,
    },
    streakStatValue: {
      color: theme.text,
      marginTop: 1,
    },
    sectionTitle: {
      color: theme.text,
      marginBottom: 14,
      marginTop: 32,
    },
  });
};
