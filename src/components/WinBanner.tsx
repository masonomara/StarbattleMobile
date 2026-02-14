import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { usePuzzleStore } from '../store';
import { formatTime } from '../utils/formatTime';
import { useTheme } from '../utils/useTheme';
import {
  SPACING_XS,
  SPACING_MD,
  SPACING_XL,
  FONT_SIZE_MD,
  FONT_SIZE_XL,
  FONT_WEIGHT_BOLD,
  WIN_BANNER_SLIDE_DISTANCE,
} from '../utils/constants';

function WinTime({ color }: { color: string }) {
  const timeMs = usePuzzleStore(s => s.timeMs);
  return <Text style={[styles.winTime, { color }]}>{formatTime(timeMs)}</Text>;
}

export function WinBanner() {
  const completed = usePuzzleStore(s => s.completed);
  const theme = useTheme();
  const navigation = useNavigation();

  const bannerTranslateY = useRef(
    new Animated.Value(WIN_BANNER_SLIDE_DISTANCE),
  ).current;

  useEffect(() => {
    if (completed) {
      Animated.spring(bannerTranslateY, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    } else {
      bannerTranslateY.setValue(WIN_BANNER_SLIDE_DISTANCE);
    }
  }, [completed, bannerTranslateY]);

  if (!completed) return null;

  return (
    <Animated.View
      style={[
        styles.winBanner,
        { backgroundColor: theme.accent },
        { transform: [{ translateY: bannerTranslateY }] },
      ]}
    >
      <Text style={[styles.winText, { color: theme.onAccent }]}>Solved!</Text>
      <WinTime color={theme.onAccent} />
      <Text
        onPress={() => navigation.goBack()}
        style={[styles.nextButton, { color: theme.onAccent }]}
      >
        Continue
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  winBanner: {
    position: 'absolute',
    bottom: -120,
    left: 0,
    right: 0,
    padding: SPACING_XL,
    alignItems: 'center',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  winText: { fontSize: FONT_SIZE_XL, fontWeight: FONT_WEIGHT_BOLD },
  winTime: { fontSize: FONT_SIZE_MD, marginTop: SPACING_XS },
  nextButton: {
    fontSize: FONT_SIZE_MD,
    marginTop: SPACING_MD,
    textDecorationLine: 'underline',
    marginBottom: 120,
  },
});
