import React, { useRef } from 'react';
import { Animated } from 'react-native';
import BootSplash from 'react-native-bootsplash';

// JS twin of the native bootsplash, built with useHideAnimation so it is
// pixel-matched to the native storyboard. The native splash is hidden only once
// this twin has laid out on top of it, then the twin fades out — so there is no
// white flash in the native → JS handoff.
export function FauxSplash({
  ready,
  onHidden,
}: {
  ready: boolean;
  onHidden: () => void;
}) {
  const opacity = useRef(new Animated.Value(1)).current;

  const { container, logo } = BootSplash.useHideAnimation({
    ready,
    manifest: require('../../assets/bootsplash/manifest.json'),
    logo: require('../../assets/bootsplash/logo.png'),
    animate: () => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onHidden();
      });
    },
  });

  return (
    <Animated.View {...container} style={[container.style, { opacity }]}>
      <Animated.Image {...logo} />
    </Animated.View>
  );
}
