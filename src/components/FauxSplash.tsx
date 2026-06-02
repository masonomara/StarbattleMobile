import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet } from 'react-native';

// Rendered as an absolute overlay inside HomeScreen so React Navigation focus
// state is unaffected — useIsFocused() in child hooks still returns true while
// this overlay is visible.
export function FauxSplash({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [rendered, setRendered] = useState(true);

  useEffect(() => {
    if (!visible) {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
  }, [visible, opacity]);

  if (!rendered) return null;

  return (
    <Animated.View
      style={[styles.container, { opacity }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Image
        source={require('../../splashlogo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  // Source image is 4138×1948 (≈ 2.12:1). Display at 85% screen width so it
  // fits all device sizes with breathing room on the sides.
  logo: {
    width: '85%',
    aspectRatio: 4138 / 1948,
  },
});
