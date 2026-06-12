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
import { useSettingsStore } from '../../shared/stores/settingsStore';
import { useStreaksStore } from '../../shared/stores/streaksStore';
import { useAuthStore } from '../../shared/stores/authStore';
import { useTheme } from '../../shared/theme/useTheme';
import { useEntitlements } from '../../shared/hooks/useEntitlements';
import { useStreakRows } from '../../shared/hooks/useStreakRows';
import { getStreakPack } from '../../packs';
import { parsePuzzle } from '../../shared/lib/parsePuzzle';
import { loadAllCompletionData } from '../../shared/lib/progress';
import { useTranslation } from 'react-i18next';
import {
  getActiveStreak,
  getPuzzleIndex,
  getPastDateKeys,
  archiveKeyToDate,
  capitalize,
  STREAK_TYPES,
  STREAK_UNIT_KEY,
} from '../../shared/lib/streakDate';
import type { Theme, StreakType, Puzzle, RootStackParamList } from '../../types';

export function StreaksModal() {
  const { t } = useTranslation();
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
        <View style={styles.modalHeader}>
          <View style={styles.modalHeaderSide} />
          <View style={styles.modalHeaderCenter}>
            <Text role="largeTitle" style={styles.headerTitle}>{t('streaks.title')}</Text>
          </View>
          <View style={styles.modalHeaderSide}>
            <Pressable onPress={closeStreaks} hitSlop={8}>
              <X size={24} color={theme.text} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.streakGrid}>
            {STREAK_TYPES.map(type => {
              const found = streaks.find(s => s.type === type);
              const current = found ? getActiveStreak(found, type) : 0;
              const best = found ? found.best : 0;
              return (
                <View key={type} style={[styles.streakTile]}>
                  <Text role="headline" style={styles.streakLabel}>{t(`streaks.label${capitalize(type)}`)}</Text>
                  <View style={styles.streakStatRow}>
                    <Text role="subhead" style={styles.streakStatLabel}>{t('streaks.best')}</Text>
                    <Text role="body" style={styles.streakStatValue}>
                      {t(`streaks.${STREAK_UNIT_KEY[type]}`, { count: best })}
                    </Text>
                  </View>
                  <View style={styles.streakStatRow}>
                    <Text role="subhead" style={styles.streakStatLabel}>{t('streaks.current')}</Text>
                    <Text role="body" style={styles.streakStatValue}>
                      {t(`streaks.${STREAK_UNIT_KEY[type]}`, { count: current })}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          <Text role="headline" style={styles.sectionTitle}>{t('streaks.archivedTitle')}</Text>

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
                name={t(`library.challenge${capitalize(type)}`)}
                meta={
                  isEmpty
                    ? t('streaks.comingSoon')
                    : t('streaks.archiveProgress', { done, count })
                }
                preview={preview}
                disabled={isEmpty}
                onPress={() => {
                  if (locked) {
                    Alert.alert(
                      t('streaks.premiumTitle'),
                      t('streaks.premiumBody'),
                      [
                        { text: t('streaks.notNow'), style: 'cancel' },
                        {
                          text: t('streaks.upgrade'),
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
