import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, Pressable, StyleSheet } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { usePuzzleStore } from '../store';
import { loadStreaks, recordStreak } from '../utils/progress';
import { getActiveStreak } from '../utils/streakDate';
import { formatTime } from '../utils/formatTime';
import { useTheme, type Theme } from '../hooks/useTheme';
import type { StreakType, Streak } from '../types/state';

export function WinBanner({
  packId,
  puzzleIndex,
  packName,
  isLastPuzzle,
  streakType,
}: {
  packId: string;
  puzzleIndex: number;
  packName: string;
  isLastPuzzle: boolean;
  streakType?: StreakType;
}) {
  const completed = usePuzzleStore(s => s.completed);
  const timeMs = usePuzzleStore(s => s.timeMs);
  const theme = useTheme();
  const styles = createStyles(theme);
  const navigation = useNavigation<{
    goBack: () => void;
    replace: (screen: string, params: object) => void;
  }>();

  const [streakCount, setStreakCount] = useState(0);
  const [bannerHeight, setBannerHeight] = useState(0);
  const bannerTranslateY = useRef(new Animated.Value(0)).current;

  const onLayout = (e: LayoutChangeEvent) => {
    setBannerHeight(e.nativeEvent.layout.height);
  };

  useEffect(() => {
    if (!completed || !streakType) return;
    async function handleStreakCompletion() {
      await recordStreak(streakType!);
      const rawStreaks = await loadStreaks();
      const found = rawStreaks.find(s => s.type === streakType);
      if (found) {
        const mapped: Streak = {
          type: streakType!,
          current: found.currentCount,
          lastCompletedKey: found.lastCompletedKey,
        };
        setStreakCount(getActiveStreak(mapped, streakType!));
      }
    }
    handleStreakCompletion();
  }, [completed, streakType]);

  useEffect(() => {
    if (!bannerHeight) return;
    if (completed) {
      bannerTranslateY.setValue(bannerHeight);
      Animated.spring(bannerTranslateY, {
        toValue: 0,
        damping: 30,
        stiffness: 300,
        useNativeDriver: true,
      }).start();
    } else {
      bannerTranslateY.setValue(bannerHeight);
    }
  }, [completed, bannerHeight, bannerTranslateY]);

  if (!completed) return null;

  const info = streakType
    ? `${streakType.charAt(0).toUpperCase() + streakType.slice(1)} Challenge`
    : `${packName} #${puzzleIndex + 1}`;

  const headline = streakType
    ? `Streak: ${streakCount}`
    : `Solved in ${formatTime(timeMs)}`;

  const handlePress = () => {
    if (streakType || isLastPuzzle) {
      navigation.goBack();
    } else {
      navigation.replace('Puzzle', { packId, puzzleIndex: puzzleIndex + 1 });
    }
  };

  const buttonLabel = streakType
    ? 'Back to Home'
    : isLastPuzzle
    ? `Back to ${packName || 'Pack'}`
    : 'Next Puzzle';

  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        styles.winBanner,
        { opacity: bannerHeight ? 1 : 0 },
        { transform: [{ translateY: bannerTranslateY }] },
      ]}
    >
      <Text style={styles.winInfo}>{info}</Text>
      <Text style={styles.winText}>{headline}</Text>
      {streakType && (
        <Text style={styles.winTime}>Solved in {formatTime(timeMs)}</Text>
      )}
      <Pressable onPress={handlePress} style={styles.winButton}>
        <Text style={styles.winButtonText}>{buttonLabel}</Text>
      </Pressable>
    </Animated.View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    winBanner: {
      position: 'absolute',
      bottom: -56,
      left: 0,
      right: 0,
      paddingTop: 24,
      paddingHorizontal: 24,
      paddingBottom: 80,
      alignItems: 'center',
      borderTopLeftRadius: 40,
      borderTopRightRadius: 40,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.03,
      shadowRadius: 4,
      elevation: 2,
      backgroundColor: theme.accent,
    },
    winText: {
      fontSize: 31,
      lineHeight: 39,
      fontWeight: theme.fontWeightSemibold,
      letterSpacing: -0.2,
      color: theme.text,
    },
    winInfo: {
      fontSize: 16,
      lineHeight: 20,
      fontWeight: theme.fontWeightSemibold,
      letterSpacing: -0.1,
      color: theme.text,
    },
    winTime: {
      fontSize: 16,
      lineHeight: 20,
      fontWeight: theme.fontWeightSemibold,
      letterSpacing: -0.1,
      color: theme.text,
      marginTop: 4,
    },
    winButton: {
      height: 40,
      width: '100%',
      borderRadius: 120,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: theme.spacingXl,
      backgroundColor: theme.onAccent,
    },
    winButtonText: {
      fontSize: theme.fontSizeMd,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
  });
