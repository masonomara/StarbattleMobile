import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';
import type { LayoutChangeEvent } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePuzzleStore } from '../store';
import { loadStreaks, recordStreak } from '../utils/progress';
import { getActiveStreak, STREAK_LABELS } from '../utils/streakDate';

import { useTheme } from '../hooks/useTheme';
import { rgba } from '../themes/ansi';
import type { Theme, RootStackParamList, WinBannerProps } from '../types';

export function WinBanner({
  packId,
  puzzleIndex,
  packName,
  isLastPuzzle,
  streakType,
}: WinBannerProps) {
  const completed = usePuzzleStore(s => s.completed);
  const loadedAsCompleted = usePuzzleStore(s => s.loadedAsCompleted);
  const timeMs = usePuzzleStore(s => s.timeMs);
  const theme = useTheme();
  const styles = createStyles(theme);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [_streakCount, setStreakCount] = useState(0);
  const [bannerHeight, setBannerHeight] = useState(0);
  const bannerTranslateY = useRef(new Animated.Value(0)).current;

  const onLayout = (e: LayoutChangeEvent) => {
    setBannerHeight(e.nativeEvent.layout.height);
  };

  useEffect(() => {
    if (!completed || !streakType) return;
    const type = streakType;
    async function updateStreak() {
      if (!loadedAsCompleted) await recordStreak(type);
      const streaks = await loadStreaks();
      const found = streaks.find(s => s.type === type);
      if (found) setStreakCount(getActiveStreak(found, type));
    }
    updateStreak();
  }, [completed, streakType, loadedAsCompleted]);

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
    ? `Solved in ${formatTime(timeMs)}`
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
      shadowOffset: { width: 0, height: 4 },
      shadowColor: '#25292E',
      shadowOpacity: 0.24,
      shadowRadius: 24,
      elevation: 8,
      backgroundColor: rgba(theme.isDark ? theme.darkGray : theme.white, 1),
    },
    winText: {
      color: rgba(theme.isDark ? theme.white : theme.black, 1),
      lineHeight: 34,
      fontSize: 28,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: 700,
      marginTop: 8,
    },
    winInfo: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: 600,

      color: rgba(theme.isDark ? theme.lightGray : theme.darkGray, 1),
    },
    winTime: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: 600,
      marginTop: 0,
      color: rgba(theme.isDark ? theme.white : theme.black, 1),
    },
    winButton: {
      height: 56,
      width: '100%',
      borderRadius: 120,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: theme.spacingXl,

      backgroundColor: rgba(theme.isDark ? theme.white : theme.black, 1),
    },
    winButtonText: {
      fontSize: 19,
      fontWeight: 700,
      color: rgba(theme.isDark ? theme.black : theme.white, 1),
    },
  });

function formatTime(ms: number): string {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}:${String(sec).padStart(2, '0')}`;
}
