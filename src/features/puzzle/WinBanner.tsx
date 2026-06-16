// NOTE: fontWeight values (900, 700, 600) are numeric here, while the rest of
// the codebase uses string literals ('900', '600'). StyleSheet.create accepts
// both on newer React Native, but numeric fontWeight can produce TS errors in
// strict mode. Prefer string literals for consistency.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../shared/ui/Text';
import type { LayoutChangeEvent } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { usePuzzleStore } from './puzzleStore';
import { recordStreak } from '../../shared/lib/progress';
import { formatElapsedTime } from '../../shared/lib/time';

import { useTheme } from '../../shared/theme/useTheme';
import { useSettingsStore } from '../../shared/stores/settingsStore';
import type {
  StreakType,
  Theme,
  RootStackParamList,
  WinBannerProps,
} from '../../types';

// The win-banner streak info line uses puzzle.winStreakInfo{Day|Week|Month}
// ("Day Streak" / "Racha diaria") — a distinct singular suffix from the
// Daily/Weekly/Monthly capitalize() used by the challenge/label keys, so it stays
// local. The count suffix uses the shared pluralized streaks.{day|week|month} keys.
const STREAK_INFO_SUFFIX: Record<StreakType, 'Day' | 'Week' | 'Month'> = {
  daily: 'Day',
  weekly: 'Week',
  monthly: 'Month',
};

export function WinBanner({
  packId,
  puzzleIndex,
  packName,
  isLastPuzzle,
  streakType,
  streakCount = 0,
  tutorial = false,
}: WinBannerProps) {
  const { t } = useTranslation();
  const completed = usePuzzleStore(s => s.completed);
  const completeTutorial = useSettingsStore(s => s.completeTutorial);
  const loadedAsCompleted = usePuzzleStore(s => s.loadedAsCompleted);
  const timeMs = usePuzzleStore(s => s.timeMs);
  const theme = useTheme();
  const styles = createStyles(theme);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [bannerHeight, setBannerHeight] = useState(0);
  const bannerTranslateY = useRef(new Animated.Value(0)).current;
  // The streak count to show. Seeded from the reactive row (correct when
  // viewing an already-completed puzzle); overwritten with the value returned
  // by recordStreak for a fresh win, so the banner shows the right number
  // immediately instead of the stale pre-completion count.
  const [recordedStreak, setRecordedStreak] = useState<number | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    setBannerHeight(e.nativeEvent.layout.height);
  };

  useEffect(() => {
    // Only the live current challenge advances the streak. Archive (past)
    // puzzles have isLastPuzzle=false and must not record — otherwise replaying
    // an old day would bump *today's* streak.
    if (!completed || !streakType || loadedAsCompleted || !isLastPuzzle) return;
    recordStreak(streakType).then(setRecordedStreak);
  }, [completed, streakType, loadedAsCompleted, isLastPuzzle]);

  const displayStreak = recordedStreak ?? streakCount;

  useEffect(() => {
    if (!bannerHeight) return;
    bannerTranslateY.setValue(bannerHeight);
    if (completed) {
      Animated.spring(bannerTranslateY, {
        toValue: 0,
        damping: 30,
        stiffness: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [completed, bannerHeight, bannerTranslateY]);

  if (!completed) return null;

  const info = tutorial
    ? t('puzzle.winTutorialInfo')
    : streakType
    ? t(`puzzle.winStreakInfo${STREAK_INFO_SUFFIX[streakType]}`)
    : t('puzzle.winPackInfo', { packName, n: puzzleIndex + 1 });

  const mainText = tutorial
    ? t('puzzle.winTutorialHeadline')
    : t('puzzle.winSolvedHeadline', { time: formatElapsedTime(timeMs) });

  const buttonLabel = tutorial
    ? t('puzzle.winTutorialButton')
    : streakType
    ? t('puzzle.winBackHome')
    : isLastPuzzle
    ? packName
      ? t('puzzle.winBackToPack', { packName })
      : t('puzzle.winBackToPackFallback')
    : t('puzzle.winNextPuzzle');

  function handlePress() {
    if (tutorial) {
      completeTutorial();
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      return;
    }
    if (streakType || isLastPuzzle) {
      navigation.goBack();
    } else {
      navigation.replace('Puzzle', { packId, puzzleIndex: puzzleIndex + 1 });
    }
  }

  return (
    // Hidden until bannerHeight is measured so the spring starts from the correct off-screen position.
    <Animated.View
      onLayout={onLayout}
      style={[
        styles.winBanner,
        { opacity: bannerHeight ? 1 : 0 },
        { transform: [{ translateY: bannerTranslateY }] },
      ]}
    >
      <Text role="body" style={styles.winInfo}>
        {info}{' '}
        {streakType && (
          <Text role="body" style={styles.winInfo}>
            {displayStreak > 0
              ? ` · ${t(`puzzle.winStreakCount${STREAK_INFO_SUFFIX[streakType!]}`, {
                  count: displayStreak,
                })}`
              : ``}
          </Text>
        )}
      </Text>
      <Text role="largeTitle" style={styles.winText}>
        {mainText}
      </Text>

      <Pressable onPress={handlePress} style={styles.winButton}>
        <Text role="headline" style={styles.winButtonText}>
          {buttonLabel}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    winBanner: {
      position: 'absolute',
      // bottom: -56 lets the banner slide up from below the viewport without leaving a gap at the screen edge.
      bottom: -56,
      left: 0,
      right: 0,
      paddingTop: 24,
      paddingHorizontal: 24,
      paddingBottom: 80,
      alignItems: 'center',
      borderTopLeftRadius: 40,
      borderTopRightRadius: 40,
      shadowOffset: { width: 0, height: 4 },
      shadowColor: '#25292E',
      shadowOpacity: 0.24,
      shadowRadius: 24,
      elevation: 8,
      backgroundColor: theme.surface,
    },
    winText: {
      color: theme.text,
    },
    winInfo: {
      color: theme.text,
      marginBottom: 7,
    },
    winButton: {
      height: 56,
      width: '100%',
      borderRadius: 120,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: theme.spacingXl,

      backgroundColor: theme.text,
    },
    winButtonText: {
      color: theme.background,
    },
  });
