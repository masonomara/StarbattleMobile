import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePuzzleStore } from '../store';
import { getPack } from '../packs';
import { formatTime } from '../utils/formatTime';
import { useTheme } from '../utils/useTheme';
import { parsePuzzleId } from '../utils/puzzleId';
import type { RootStackParams } from '../types/navigation';
import {
  FONT_SIZE_MD,
  FONT_WEIGHT_SEMIBOLD,
  SPACING_XL,
  WIN_BANNER_PADDING,
  WIN_BANNER_BORDER_RADIUS,
  WIN_BANNER_BUTTON_HEIGHT,
  WIN_BANNER_BUTTON_RADIUS,
  WIN_BANNER_TITLE_SIZE,
  WIN_BANNER_TITLE_LINE_HEIGHT,
  WIN_BANNER_INFO_SIZE,
  WIN_BANNER_INFO_LINE_HEIGHT,
} from '../utils/constants';

export function WinBanner() {
  const completed = usePuzzleStore(s => s.completed);
  const puzzleId = usePuzzleStore(s => s.puzzle?.id);
  const timeMs = usePuzzleStore(s => s.timeMs);
  const theme = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();

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
        { backgroundColor: theme.accent },
        { opacity: bannerHeight ? 1 : 0 },
        { transform: [{ translateY: bannerTranslateY }] },
      ]}
    >
      <Text style={[styles.winInfo, { color: theme.onAccent }]}>
        {pack?.name} #{puzzleIndex + 1}
      </Text>
      <Text style={[styles.winText, { color: theme.onAccent }]}>
        Solved in {formatTime(timeMs)}
      </Text>

      <TouchableOpacity
        onPress={handleNext}
        activeOpacity={0.8}
        style={[styles.winButton, { backgroundColor: theme.onAccent }]}
      >
        <Text style={[styles.winButtonText, { color: theme.accent }]}>
          {isLastPuzzle ? `Back to ${pack?.name ?? 'Pack'}` : 'Next Puzzle'}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  winBanner: {
    position: 'absolute',
    bottom: -80,
    left: 0,
    right: 0,
    paddingTop: WIN_BANNER_PADDING,
    paddingHorizontal: WIN_BANNER_PADDING,
    paddingBottom: 80,
    alignItems: 'center',
    borderTopLeftRadius: WIN_BANNER_BORDER_RADIUS,
    borderTopRightRadius: WIN_BANNER_BORDER_RADIUS,
  },
  winText: {
    fontSize: WIN_BANNER_TITLE_SIZE,
    lineHeight: WIN_BANNER_TITLE_LINE_HEIGHT,
    fontWeight: FONT_WEIGHT_SEMIBOLD,
    letterSpacing: -0.2,
  },
  winInfo: {
    fontSize: WIN_BANNER_INFO_SIZE,
    lineHeight: WIN_BANNER_INFO_LINE_HEIGHT,
    fontWeight: FONT_WEIGHT_SEMIBOLD,
    letterSpacing: -0.1,
  },
  winButton: {
    height: WIN_BANNER_BUTTON_HEIGHT,
    width: '100%',
    borderRadius: WIN_BANNER_BUTTON_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING_XL,
  },
  winButtonText: {
    fontSize: FONT_SIZE_MD,
    fontWeight: FONT_WEIGHT_SEMIBOLD,
  },
});
