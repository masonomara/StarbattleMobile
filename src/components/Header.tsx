import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ellipsis } from 'lucide-react-native';
import { SettingsModal } from './SettingsModal';
import { useTheme, type Theme } from '../hooks/useTheme';

type HeaderProps = {
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  absolute?: boolean;
};

export function Header({ left, center, right, absolute }: HeaderProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = createStyles(theme);
  const [settingsVisible, setSettingsVisible] = useState(false);

  return (
    <>
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
        <View style={styles.side}>
          {right ?? (
            <Pressable
              onPress={() => setSettingsVisible(true)}
              hitSlop={8}
              style={styles.headerButton}
            >
              <Ellipsis size={20} color={theme.text} />
            </Pressable>
          )}
        </View>
      </View>
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
      />
    </>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      minHeight: 48,
      zIndex: 100,
    },
    absolute: {
      position: 'absolute',
      left: 0,
      right: 0,
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
    headerButton: {
      width: 36,
      height: 36,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 8,
      opacity: 0.97,
      backgroundColor: theme.card,
      shadowColor: theme.shadow,
    },
  });
