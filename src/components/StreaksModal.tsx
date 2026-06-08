// CLEANUP: archiveCounts is recomputed inline on each render by calling
// getPastDateKeys three times. Wrap in useMemo — the value only changes at
// day-rollover so it's effectively stable across a session.
//
// CONCERN: The premium lock for archive access uses an Alert to redirect to
// Settings. Consider a dedicated PaywallModal context variant instead of an
// Alert so the UX is consistent with the rest of the paywall flows.
import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { Text } from './Text';
import { PackCard } from './PackCard';
import X from 'lucide-react-native/dist/cjs/icons/x';
import Lock from 'lucide-react-native/dist/cjs/icons/lock';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSettingsStore } from '../stores/settingsStore';
import { useStreaksStore } from '../stores/streaksStore';
import { useAuthStore } from '../stores/authStore';
import { useTheme } from '../hooks/useTheme';
import { useEntitlements } from '../hooks/useEntitlements';
import { useStreakRows } from '../hooks/useStreakRows';
import { getStreakPack } from '../packs';
import { parsePuzzle } from '../utils/parsePuzzle';
import {
  getActiveStreak,
  getPuzzleIndex,
  getPastDateKeys,
  archiveKeyToDate,
  STREAK_TYPES,
  STREAK_LABELS,
  STREAK_UNIT,
} from '../utils/streakDate';
import type { Theme, StreakType, Puzzle, RootStackParamList } from '../types';

const ARCHIVE_NAMES: Record<StreakType, string> = {
  daily: 'Daily Special',
  weekly: 'Weekly Special',
  monthly: 'Monthly Special',
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
  const archiveCounts: Record<StreakType, number> = {
    daily: getPastDateKeys('daily').length,
    weekly: getPastDateKeys('weekly').length,
    monthly: getPastDateKeys('monthly').length,
  };
  const [thumbnails, setThumbnails] = useState<
    Partial<Record<StreakType, Puzzle>>
  >({});

  useEffect(() => {
    if (!streaksModalVisible) return;

    async function loadThumbnails() {
      const thumbResults: Partial<Record<StreakType, Puzzle>> = {};
      await Promise.all(
        STREAK_TYPES.map(async type => {
          try {
            const pack = await getStreakPack(type);
            if (!pack) return;
            const recentKey = getPastDateKeys(type)[0];
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
  }, [streaksModalVisible]);

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
            <Text role="title" style={styles.headerTitle}>Streaks</Text>
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
                  <Text role="subtitle" style={styles.streakLabel}>{STREAK_LABELS[type]}</Text>
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

          <Text role="sectionTitle" style={styles.sectionTitle}>Archived Specials</Text>

          {STREAK_TYPES.map(type => {
            const count = archiveCounts[type];
            const preview = thumbnails[type];
            const isEmpty = count === 0;
            const locked = !isPremium;
            return (
              <PackCard
                key={type}
                name={ARCHIVE_NAMES[type]}
                meta={isEmpty ? 'Coming soon' : `${count} specials`}
                preview={preview}
                disabled={isEmpty}
                onPress={() => {
                  if (locked) {
                    Alert.alert(
                      'Premium Feature',
                      'Upgrade to Premium to access past specials.',
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
      fontWeight: '900',
    },
    streakStatRow: {
      marginTop: 8,
    },
    streakStatLabel: {
      color: theme.textSecondary,
    },
    streakStatValue: {
      fontWeight: '600',
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
