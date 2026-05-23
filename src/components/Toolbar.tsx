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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePuzzleStore } from '../store';
import { useSettingsStore } from '../stores/settingsStore';
import { useTheme } from '../hooks/useTheme';
import { Haptics } from 'react-native-nitro-haptics';
import type { TapMode } from '../types/state';
import type { Theme } from '../types/theme';
import type { ToolbarProps } from '../types/components';

const TAP_MODE_ICONS: Record<TapMode, typeof Pencil> = {
  cycle: Pencil,
  erase: Eraser,
};

export function Toolbar({ isZoomed, onZoomReset }: ToolbarProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
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
  const hintDisabled = completed || !hasHints;

  const TapModeIcon = TAP_MODE_ICONS[tapMode];

  function press(action: () => void) {
    if (hapticsEnabled) Haptics.impact('medium');
    action();
  }

  function handleClear() {
    if (hapticsEnabled) Haptics.impact('medium');
    Alert.alert('Clear Board', 'Are you sure you want to clear the board?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearBoard },
    ]);
  }

  return (
    // bottom offset intentionally overlaps the safe area by 12 pt for visual grounding.
    <View style={[styles.toolbar, { bottom: insets.bottom - 12 }]}>
      <View style={styles.toolbarWrapper}>
        <Pressable
          onPress={() => press(onZoomReset)}
          disabled={!isZoomed}
          style={[styles.button, !isZoomed && styles.buttonDisabled]}
        >
          <Minimize2 size={26} color={theme.text} />
        </Pressable>

        <Pressable
          onPress={() => press(showHint)}
          disabled={hintDisabled}
          style={[
            styles.button,
            hasGhosts && styles.buttonAccent,
            hintDisabled && styles.buttonDisabled,
          ]}
        >
          <Lightbulb size={26} color={theme.text} />
        </Pressable>

        <Pressable
          onPress={() => press(cycleTapMode)}
          disabled={completed}
          style={[styles.button, completed && styles.buttonDisabled]}
        >
          <TapModeIcon size={26} color={theme.text} />
        </Pressable>

        <Pressable
          onPress={() => press(undo)}
          disabled={undoDisabled}
          style={[styles.button, undoDisabled && styles.buttonDisabled]}
        >
          <Undo2 size={26} color={theme.text} />
        </Pressable>

        <Pressable
          onPress={() => press(redo)}
          disabled={redoDisabled}
          style={[styles.button, redoDisabled && styles.buttonDisabled]}
        >
          <Redo2 size={26} color={theme.text} />
        </Pressable>

        <Pressable
          onPress={handleClear}
          disabled={clearDisabled}
          style={[styles.button, clearDisabled && styles.buttonDisabled]}
        >
          <Trash2 size={26} color={theme.text} />
        </Pressable>
      </View>
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
    },
    toolbarWrapper: {
      gap: 4,
      flexDirection: 'row',
      padding: 4,
      flex: 1,
      maxWidth: 412,
      borderRadius: 100,
      backgroundColor: theme.bg,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 24,
      elevation: 8,
      zIndex: 0,
    },
    button: {
      height: 48,
      maxWidth: 64,
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 100,
      zIndex: 100,
      backgroundColor: theme.bg,
    },
    buttonAccent: {
      backgroundColor: theme.accent,
    },
    buttonDisabled: {
      opacity: 0.4,
    },
  });
