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
    <View style={[styles.toolbar, { bottom: insets.bottom - 12 }]}>
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
      left: theme.spacingLg,
      right: theme.spacingLg,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
      display: 'flex',
      padding: 4,
      margin: 0,
    },
    button: {
      height: 48,
      maxWidth: 64,
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',

      borderRadius: 100,
      backgroundColor: theme.bg,
      borderWidth: 1,
      borderColor: theme.bg,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 48,
      elevation: 8,
    },
    disabled: { opacity: 0.4 },
  });
