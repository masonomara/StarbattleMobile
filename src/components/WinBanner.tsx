import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, Pressable, StyleSheet } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePuzzleStore } from '../store';
import { loadStreaks, recordStreak } from '../utils/progress';
import { getActiveStreak, STREAK_LABELS } from '../utils/streakDate';
import { formatTime } from '../utils/formatTime';
import { useTheme } from '../hooks/useTheme';
import type { Theme } from '../types/theme';
import type { RootStackParamList } from '../types/navigation';
import type { WinBannerProps } from '../types/components';

export function WinBanner({
  packId,
  puzzleIndex,
  packName,
  isLastPuzzle,
  streakType,
}: WinBannerProps) {
  const completed = usePuzzleStore(s => s.completed);
  const timeMs = usePuzzleStore(s => s.timeMs);
  const theme = useTheme();
  const styles = createStyles(theme);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [streakCount, setStreakCount] = useState(0);
  const [bannerHeight, setBannerHeight] = useState(0);
  const bannerTranslateY = useRef(new Animated.Value(0)).current;

  const onLayout = (e: LayoutChangeEvent) => {
    setBannerHeight(e.nativeEvent.layout.height);
  };

  useEffect(() => {
    if (!completed || !streakType) return;
    const type = streakType;
    async function updateStreak() {
      await recordStreak(type);
      const rawStreaks = await loadStreaks();
      const found = rawStreaks.find(s => s.type === type);
      if (found) {
        setStreakCount(
          getActiveStreak(
            {
              type,
              current: found.currentCount,
              lastCompletedKey: found.lastCompletedKey,
            },
            type,
          ),
        );
      }
    }
    updateStreak();
  }, [completed, streakType]);

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

  const info = streakType
    ? `${STREAK_LABELS[streakType]} Challenge`
    : `${packName} #${puzzleIndex + 1}`;

  const headline = streakType
    ? `Streak: ${streakCount}`
    : `Solved in ${formatTime(timeMs)}`;

  const buttonLabel = streakType
    ? 'Back to Home'
    : isLastPuzzle
    ? `Back to ${packName || 'Pack'}`
    : 'Next Puzzle';

  function handlePress() {
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
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
  });
