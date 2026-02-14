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
  SPACING_XL,
  FONT_SIZE_MD,
  FONT_SIZE_XL,
  FONT_WEIGHT_BOLD,
} from '../utils/constants';

function WinTime({ color }: { color: string }) {
  const timeMs = usePuzzleStore(s => s.timeMs);
  return <Text style={[styles.winTime, { color }]}>{formatTime(timeMs)}</Text>;
}

export function WinBanner() {
  const completed = usePuzzleStore(s => s.completed);
  const puzzleId = usePuzzleStore(s => s.puzzle?.id);
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
      <Text style={[styles.winText, { color: theme.onAccent }]}>Solved!</Text>
      <WinTime color={theme.onAccent} />
      <Button
        title={isLastPuzzle ? `Back to ${pack?.name ?? 'Pack'}` : 'Next Puzzle'}
        onPress={handleNext}
        color={theme.onAccent}
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
    padding: SPACING_XL,
    alignItems: 'center',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  winText: { fontSize: FONT_SIZE_XL, fontWeight: FONT_WEIGHT_BOLD },
  winTime: { fontSize: FONT_SIZE_MD, marginTop: SPACING_XS },
});
