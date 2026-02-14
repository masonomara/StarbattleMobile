import React, { memo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Undo2, Minimize2 } from 'lucide-react-native';
import { usePuzzleStore } from '../store';
import {
  SPACING_LG,
  TOOLBAR_BUTTON_SIZE,
  TOOLBAR_BOTTOM,
  TOOLBAR_ICON_SIZE,
  RADIUS_LG,
  SHADOW_MD,
  DISABLED_OPACITY,
} from '../utils/constants';
import { useTheme } from '../utils/useTheme';

type Props = {
  isZoomed: boolean;
  onZoomReset: () => void;
};

export const Toolbar = memo(function Toolbar({ isZoomed, onZoomReset }: Props) {
  const theme = useTheme();
  const undo = usePuzzleStore(s => s.undo);
  const completed = usePuzzleStore(s => s.completed);
  const canUndo = usePuzzleStore(s => s.moveLog.length > 0);
  const undoDisabled = !canUndo || completed;
  const zoomDisabled = !isZoomed;

  return (
    <View style={styles.toolbar}>
      <Pressable
        onPress={onZoomReset}
        disabled={zoomDisabled}
        style={[
          styles.button,
          { backgroundColor: theme.card, shadowColor: theme.shadow },
          zoomDisabled && styles.disabled,
        ]}
      >
        <Minimize2 size={TOOLBAR_ICON_SIZE} color={theme.text} />
      </Pressable>

      <Pressable
        onPress={undo}
        disabled={undoDisabled}
        style={[
          styles.button,
          { backgroundColor: theme.card, shadowColor: theme.shadow },
          undoDisabled && styles.disabled,
        ]}
      >
        <Undo2 size={TOOLBAR_ICON_SIZE} color={theme.text} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  toolbar: {
    position: 'absolute',
    bottom: TOOLBAR_BOTTOM,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING_LG,
  },
  button: {
    width: TOOLBAR_BUTTON_SIZE,
    height: TOOLBAR_BUTTON_SIZE,
    borderRadius: RADIUS_LG,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW_MD,
  },
  disabled: { opacity: DISABLED_OPACITY },
});
