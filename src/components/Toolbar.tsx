import React from 'react';
import { Alert, View, Pressable, StyleSheet } from 'react-native';
import {
  Undo2,
  Redo2,
  Minimize2,
  Trash2,
  Lightbulb,
  Pencil,
  Eraser,
} from 'lucide-react-native';
import { usePuzzleStore } from '../store';
import { hapticMedium } from '../utils/haptics';
import { useSettingsStore } from '../stores/settingsStore';
import type { TapMode } from '../types/state';
import { useTheme, type Theme } from '../hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAP_MODE_ICONS: Record<TapMode, typeof Pencil> = {
  cycle: Pencil,
  erase: Eraser,
};

type Props = {
  isZoomed: boolean;
  onZoomReset: () => void;
};

export function Toolbar({ isZoomed, onZoomReset }: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const hapticsEnabled = useSettingsStore(s => s.settings.haptics);
  const undo = usePuzzleStore(s => s.undo);
  const redo = usePuzzleStore(s => s.redo);
  const clearBoard = usePuzzleStore(s => s.clearBoard);
  const cycleTapMode = usePuzzleStore(s => s.cycleTapMode);
  const tapMode = usePuzzleStore(s => s.tapMode);
  const completed = usePuzzleStore(s => s.completed);
  const showHint = usePuzzleStore(s => s.showHint);
  const hasGhosts = usePuzzleStore(s => s.hintGhosts.size > 0);
  const hasHints = usePuzzleStore(s => (s.puzzle?.hints.length ?? 0) > 0);
  const canUndo = usePuzzleStore(s => s.moveLog.length > 0);
  const canRedo = usePuzzleStore(s => s.redoStack.length > 0);
  const hasContent = usePuzzleStore(s => s.cells.some(c => c !== 0));
  const undoDisabled = !canUndo || completed;
  const redoDisabled = !canRedo || completed;
  const clearDisabled = !hasContent || completed;
  const zoomDisabled = !isZoomed;
  const hintDisabled = completed || !hasHints;

  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.toolbar, { bottom: 16 + insets.bottom }]}>
      <Pressable
        onPress={() => {
          if (hapticsEnabled) hapticMedium();
          onZoomReset();
        }}
        disabled={zoomDisabled}
        style={[styles.button, zoomDisabled && styles.disabled]}
      >
        <Minimize2 size={24} color={theme.text} />
      </Pressable>

      <Pressable
        onPress={() => {
          if (hapticsEnabled) hapticMedium();
          showHint();
        }}
        disabled={hintDisabled}
        style={[
          styles.button,
          hasGhosts && { backgroundColor: theme.accent },
          hintDisabled && styles.disabled,
        ]}
      >
        <Lightbulb size={24} color={theme.text} />
      </Pressable>

      <Pressable
        onPress={() => {
          if (hapticsEnabled) hapticMedium();
          cycleTapMode();
        }}
        disabled={completed}
        style={[styles.button, completed && styles.disabled]}
      >
        {React.createElement(TAP_MODE_ICONS[tapMode], {
          size: 24,
          color: theme.text,
        })}
      </Pressable>

      <Pressable
        onPress={() => {
          if (hapticsEnabled) hapticMedium();
          undo();
        }}
        disabled={undoDisabled}
        style={[styles.button, undoDisabled && styles.disabled]}
      >
        <Undo2 size={24} color={theme.text} />
      </Pressable>

      <Pressable
        onPress={() => {
          if (hapticsEnabled) hapticMedium();
          redo();
        }}
        disabled={redoDisabled}
        style={[styles.button, redoDisabled && styles.disabled]}
      >
        <Redo2 size={24} color={theme.text} />
      </Pressable>

      <Pressable
        onPress={() => {
          if (hapticsEnabled) hapticMedium();
          Alert.alert(
            'Clear Board',
            'Are you sure you want to clear the board?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: clearBoard },
            ],
          );
        }}
        disabled={clearDisabled}
        style={[styles.button, clearDisabled && styles.disabled]}
      >
        <Trash2 size={24} color={theme.text} />
      </Pressable>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    toolbar: {
      position: 'absolute',
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
    },
    button: {
      width: 48,
      height: 48,
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
    disabled: { opacity: 0.3 },
  });
