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
} from '../utils/streakDate';
import type {
  Theme,
  StreakType,
  Puzzle,
  RootStackParamList,
} from '../types';

const STREAK_TILE_COLORS = ['#8FD6AE', '#81D0E7', '#D3C2FA'];

const ARCHIVE_NAMES: Record<StreakType, string> = {
  daily: 'Daily Specials',
  weekly: 'Weekly Specials',
  monthly: 'Monthly Specials',
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
  const streaks = useStreakRows(userId);

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
        <View style={[styles.modalHeader, scrolled && styles.modalHeaderBorder]}>
          <View style={styles.modalHeaderSide} />
          <View style={styles.modalHeaderCenter}>
            <Text style={styles.headerTitle}>Streaks</Text>
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

          <Text style={styles.sectionTitle}>Puzzle Archive</Text>

          {STREAK_TYPES.map(type => {
            const count = archiveCounts[type];
            const preview = thumbnails[type];
            const isEmpty = count === 0;
            const locked = !isPremium;
            return (
              <PackCard
                key={type}
                name={ARCHIVE_NAMES[type]}
                meta={isEmpty ? 'Coming soon' : `${count} puzzles`}
                preview={preview}
                disabled={isEmpty}
                onPress={() => {
                  if (locked) {
                    Alert.alert(
                      'Premium Feature',
                      'Upgrade to Premium to access past puzzles.',
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
                    <Lock size={19} color={theme.textSecondary} strokeWidth={2.5}/>
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
      paddingTop: theme.spacingXl,
      backgroundColor: theme.background,
    },
    scrollContent: {
      paddingHorizontal: theme.spacingXl,
      paddingBottom: theme.spacingXl,
    },
    modalHeader: {
      height: 48,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
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
      fontWeight: '900',
      color: theme.blue,
    },
    streakLabel: {
      fontSize: theme.fontSizeSubhead,
      color: theme.textSecondary,
      marginTop: 4,
    },
    sectionTitle: {
      fontSize: 20,
      color: theme.text,
      lineHeight: 22,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: '900',
      marginBottom: 14,
    },
  });
};
