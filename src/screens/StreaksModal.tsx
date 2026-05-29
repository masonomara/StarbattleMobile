import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { Text } from '../components/Text';
import { PackCard } from '../components/PackCard';
import X from 'lucide-react-native/dist/cjs/icons/x';
import Lock from 'lucide-react-native/dist/cjs/icons/lock';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Header } from '../components/Header';
import { useSettingsStore } from '../stores/settingsStore';
import { useStreaksStore } from '../stores/streaksStore';
import { useTheme } from '../hooks/useTheme';
import { useEntitlements } from '../hooks/useEntitlements';
import { loadStreaks } from '../utils/progress';
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
  Streak,
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

  const [scrolled, setScrolled] = useState(false);
  const [streaks, setStreaks] = useState<Streak[]>([]);
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

    async function load() {
      const rawStreaks = await loadStreaks();
      setStreaks(rawStreaks);

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

    load();
  }, [streaksModalVisible]);

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
          bordered={scrolled}
          center={<Text style={styles.headerTitle}>Streaks</Text>}
          right={
            <Pressable onPress={closeStreaks} hitSlop={8}>
              <X size={24} color={theme.text} />
            </Pressable>
          }
        />

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
