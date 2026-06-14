import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import type { HeaderProps } from '../../types';
import { SCREEN_HEADER_HEIGHT } from '../lib/layout';

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
        { paddingTop: insets.top, height: SCREEN_HEADER_HEIGHT + insets.top },
        bordered && {
          borderBottomWidth: 1,
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
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    gap: 12,
    overflow: 'visible',
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
    height: '100%',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',

    height: '100%',
  },
});
