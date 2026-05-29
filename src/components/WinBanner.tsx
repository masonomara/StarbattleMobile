// Remove it if the separate time line was removed; keep if it's planned to return.
//
// NOTE: fontWeight values (900, 700, 600) are numeric here, while the rest of
// the codebase uses string literals ('900', '600'). StyleSheet.create accepts
// both on newer React Native, but numeric fontWeight can produce TS errors in
// strict mode. Prefer string literals for consistency.
//
// NOTE: formatTime duplicates the mm:ss logic from HeaderTimer (which builds
// the same format inline). Extract to a shared util to avoid drift if the
// display format ever changes.
//
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';
import type { LayoutChangeEvent } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePuzzleStore } from '../stores/puzzleStore';
import { recordStreak } from '../utils/progress';
import { STREAK_LABELS, STREAK_UNIT } from '../utils/streakDate';

import { useTheme } from '../hooks/useTheme';
import type { Theme, RootStackParamList, WinBannerProps } from '../types';

export function WinBanner({
  packId,
  puzzleIndex,
  packName,
  isLastPuzzle,
  streakType,
  streakCount = 0,
}: WinBannerProps) {
  const completed = usePuzzleStore(s => s.completed);
  const loadedAsCompleted = usePuzzleStore(s => s.loadedAsCompleted);
  const timeMs = usePuzzleStore(s => s.timeMs);
  const theme = useTheme();
  const styles = createStyles(theme);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [bannerHeight, setBannerHeight] = useState(0);
  const bannerTranslateY = useRef(new Animated.Value(0)).current;

  const onLayout = (e: LayoutChangeEvent) => {
    setBannerHeight(e.nativeEvent.layout.height);
  };

  useEffect(() => {
    if (!completed || !streakType || loadedAsCompleted) return;
    recordStreak(streakType);
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
    ? `${STREAK_LABELS[streakType]} Special`
    : `${packName} #${puzzleIndex + 1}`;

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
      <Text style={styles.winInfo}>{info} {streakType && (
        <Text style={styles.winInfo}>
          {/* streakType! non-null assertion: safe here because the wrapping
            `{streakType && ...}` already guards against null/undefined, but
            TypeScript can't narrow through JSX text. Could rewrite as
            `{streakType ? STREAK_UNIT[streakType] : ''}` to avoid the assertion. */}
        {streakCount > 0 ? ` •  ${streakCount} ${STREAK_UNIT[streakType!]} streak` : ``}
        </Text>
      )}</Text>
      <Text style={styles.winText}>{`Solved in ${formatTime(timeMs)}`}</Text>

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
      backgroundColor: theme.surface,
    },
    winText: {
      color: theme.text,
      lineHeight: 36,
      fontSize: 33,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: 900,

      letterSpacing: -0.33,
    },
    winInfo: {
      color: theme.text,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: 600,
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
      fontSize: 19,
      fontWeight: 700,
      color: theme.background,
    },
  });

function formatTime(ms: number): string {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}:${String(sec).padStart(2, '0')}`;
}
