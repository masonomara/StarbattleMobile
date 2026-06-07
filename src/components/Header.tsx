import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import type { HeaderProps } from '../types';

export function Header({
  left,
  center,
  right,
  absolute = true,
  bordered = false,
}: HeaderProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    // box-none lets touches fall through the transparent header area to content below.
    <View
      pointerEvents="box-none"
      style={[
        styles.header,
        absolute && styles.absolute,
        { paddingTop: insets.top, height: 48 + insets.top },
        bordered && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        },
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
    gap: 10,
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
    // borderWidth: 1,
    // borderColor: 'blue',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    // borderWidth: 1,
    // borderColor: 'red',
    height: 80,
    paddingTop: 14.5,
  },
});
