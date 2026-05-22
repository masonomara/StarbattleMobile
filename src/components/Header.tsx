import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HeaderProps } from '../types/components';

export function Header({ left, center, right, absolute = true }: HeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    // box-none lets touches fall through the transparent header area to content below.
    <View
      pointerEvents="box-none"
      style={[
        styles.header,
        absolute && styles.absolute,
        { paddingTop: insets.top, height: 48 + insets.top },
      ]}
    >
      <View style={styles.side}>{left}</View>
      <View pointerEvents="box-none" style={styles.center}>
        {center}
      </View>
      <View style={styles.side}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  absolute: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 100,
  },
  side: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
