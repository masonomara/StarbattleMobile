import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { usePuzzleStore } from '../store';
import { getPack } from '../packs';
import { formatTime } from '../utils/formatTime';
import { useTheme } from '../hooks/useTheme';
import { parsePuzzleId } from '../utils/puzzleId';
import type { Theme } from '../types/theme';

export function WinBanner() {
  const completed = usePuzzleStore(s => s.completed);
  const puzzleId = usePuzzleStore(s => s.puzzle?.id);
  const timeMs = usePuzzleStore(s => s.timeMs);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<any>();

  const { packId, index: puzzleIndex } = puzzleId
    ? parsePuzzleId(puzzleId)
    : { packId: '', index: 0 };
  const pack = getPack(packId);
  const isLastPuzzle = !pack || puzzleIndex >= pack.puzzles.length - 1;

  const [bannerHeight, setBannerHeight] = useState(0);
  const bannerTranslateY = useRef(new Animated.Value(0)).current;

  const onLayout = (e: LayoutChangeEvent) => {
    setBannerHeight(e.nativeEvent.layout.height);
  };

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

  const handleNext = () => {
    if (isLastPuzzle) {
      navigation.goBack();
    } else {
      navigation.replace('Puzzle', { packId, puzzleIndex: puzzleIndex + 1 });
    }
  };

  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        styles.winBanner,
        { opacity: bannerHeight ? 1 : 0 },
        { transform: [{ translateY: bannerTranslateY }] },
      ]}
    >
      <Text style={styles.winInfo}>
        {pack?.name} #{puzzleIndex + 1}
      </Text>
      <Text style={styles.winText}>
        Solved in {formatTime(timeMs)}
      </Text>

      <TouchableOpacity
        onPress={handleNext}
        activeOpacity={0.8}
        style={styles.winButton}
      >
        <Text style={styles.winButtonText}>
          {isLastPuzzle ? `Back to ${pack?.name ?? 'Pack'}` : 'Next Puzzle'}
        </Text>
      </TouchableOpacity>
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
