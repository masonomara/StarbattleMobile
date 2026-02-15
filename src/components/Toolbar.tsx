import React, { memo } from 'react';
import { Alert, View, Pressable, StyleSheet } from 'react-native';
import {
  Undo2,
  Redo2,
  Minimize2,
  Trash2,
  Lightbulb,
  Pencil,
  X,
  Star,
  Eraser,
} from 'lucide-react-native';
import { usePuzzleStore } from '../store';
import type { TapMode } from '../types/state';
import { RADIUS_LG, SHADOW_MD, DISABLED_OPACITY } from '../utils/constants';
import { useTheme } from '../utils/useTheme';

const TAP_MODE_ICONS: Record<TapMode, typeof Pencil> = {
  cycle: Pencil,
  mark: X,
  star: Star,
  erase: Eraser,
};

type Props = {
  isZoomed: boolean;
  onZoomReset: () => void;
};

export const Toolbar = memo(function Toolbar({ isZoomed, onZoomReset }: Props) {
  const theme = useTheme();
  const undo = usePuzzleStore(s => s.undo);
  const redo = usePuzzleStore(s => s.redo);
  const clearBoard = usePuzzleStore(s => s.clearBoard);
  const cycleTapMode = usePuzzleStore(s => s.cycleTapMode);
  const tapMode = usePuzzleStore(s => s.tapMode);
  const completed = usePuzzleStore(s => s.completed);
  const canUndo = usePuzzleStore(s => s.moveLog.length > 0);
  const canRedo = usePuzzleStore(s => s.redoStack.length > 0);
  const hasContent = usePuzzleStore(s => s.cells.some(c => c !== 0));
  const undoDisabled = !canUndo || completed;
  const redoDisabled = !canRedo || completed;
  const clearDisabled = !hasContent || completed;
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
        <Minimize2 size={22} color={theme.text} />
      </Pressable>

      <Pressable
        onPress={() =>
          Alert.alert(
            "Don't be a cheater.",
            'Just kidding, free hints are coming soon!',
          )
        }
        style={[
          styles.button,
          { backgroundColor: theme.card, shadowColor: theme.shadow },
        ]}
      >
        <Lightbulb size={22} color={theme.text} />
      </Pressable>

      <Pressable
        onPress={cycleTapMode}
        disabled={completed}
        style={[
          styles.button,
          { backgroundColor: theme.card, shadowColor: theme.shadow },
          completed && styles.disabled,
        ]}
      >
        {React.createElement(TAP_MODE_ICONS[tapMode], {
          size: 22,
          color: theme.text,
        })}
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
        <Undo2 size={22} color={theme.text} />
      </Pressable>

      <Pressable
        onPress={redo}
        disabled={redoDisabled}
        style={[
          styles.button,
          { backgroundColor: theme.card, shadowColor: theme.shadow },
          redoDisabled && styles.disabled,
        ]}
      >
        <Redo2 size={22} color={theme.text} />
      </Pressable>

      <Pressable
        onPress={() =>
          Alert.alert(
            'Clear Board',
            'Are you sure you want to clear the board?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: clearBoard },
            ],
          )
        }
        disabled={clearDisabled}
        style={[
          styles.button,
          { backgroundColor: theme.card, shadowColor: theme.shadow },
          clearDisabled && styles.disabled,
        ]}
      >
        <Trash2 size={22} color={theme.text} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  toolbar: {
    position: 'absolute',
    bottom: 88,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: RADIUS_LG,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW_MD,
  },
  disabled: { opacity: DISABLED_OPACITY },
});
