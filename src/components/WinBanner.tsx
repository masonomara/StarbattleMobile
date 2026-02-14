import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, Button, StyleSheet } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePuzzleStore } from '../store';
import { getPack } from '../packs';
import { formatTime } from '../utils/formatTime';
import { useTheme } from '../utils/useTheme';
import type { RootStackParams } from '../navigation';
import {
  SPACING_XS,
  FONT_SIZE_MD,
  FONT_SIZE_XL,
  FONT_WEIGHT_BOLD,
} from '../utils/constants';

export function WinBanner() {
  const completed = usePuzzleStore(s => s.completed);
  const puzzleId = usePuzzleStore(s => s.puzzle?.id);
  const timeMs = usePuzzleStore(s => s.timeMs);
  const theme = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();

  const packId = puzzleId?.split(':')[0] ?? '';
  const puzzleIndex = Number(puzzleId?.split(':')[1] ?? 0);
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
        { transform: [{ translateY: bannerTranslateY }] },
      ]}
    >
      <Text style={[styles.winText, { color: theme.onAccent }]}>Solved in {formatTime(timeMs)}</Text>
    
      <Button
        title={isLastPuzzle ? `Back to ${pack?.name ?? 'Pack'}` : 'Next Puzzle'}
        onPress={handleNext}
        color={theme.onAccent}
        style={[styles.winButton, {backgroundColor: theme.onAccent}]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  winBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 24,
    paddingLeft: 16,
    paddingRight: 16,
    paddingBottom: 16,
    alignItems: 'center',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },
  winText: { fontSize: FONT_SIZE_XL, fontWeight: FONT_WEIGHT_BOLD },
  winTime: { fontSize: FONT_SIZE_MD, marginTop: SPACING_XS },
  winButton: { height: 44, width: '100%', borderRadius: 16,}
});
