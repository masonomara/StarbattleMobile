import React from 'react';
import { Alert, View, Pressable, StyleSheet } from 'react-native';
import Undo2 from 'lucide-react-native/dist/cjs/icons/undo-2';
import Redo2 from 'lucide-react-native/dist/cjs/icons/redo-2';
import Minimize2 from 'lucide-react-native/dist/cjs/icons/minimize-2';
import Trash2 from 'lucide-react-native/dist/cjs/icons/trash-2';
import Lightbulb from 'lucide-react-native/dist/cjs/icons/lightbulb';
import Pencil from 'lucide-react-native/dist/cjs/icons/pencil';
import Eraser from 'lucide-react-native/dist/cjs/icons/eraser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePuzzleStore } from './puzzleStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTheme } from '../../shared/theme/useTheme';
import { Haptics } from 'react-native-nitro-haptics';
import type { TapMode, Theme, ToolbarProps } from '../../types';

const TAP_MODE_ICONS: Record<TapMode, typeof Pencil> = {
  cycle: Pencil,
  erase: Eraser,
};

export function Toolbar({ isZoomed, onZoomReset, hintDisabledMessage }: ToolbarProps) {
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
  const hintsLoading = usePuzzleStore(s => s.hintsLoading);
  const canUndo = usePuzzleStore(s => s.moveLog.length > 0);
  const canRedo = usePuzzleStore(s => s.redoStack.length > 0);
  const hasContent = usePuzzleStore(s => s.cells.some(c => c !== 0));

  const undoDisabled = !canUndo || completed;
  const redoDisabled = !canRedo || completed;
  const clearDisabled = !hasContent || completed;

  const TapModeIcon = TAP_MODE_ICONS[tapMode];

  function press(action: () => void) {
    if (hapticsEnabled) Haptics.impact('medium');
    action();
  }

  function handleHint() {
    if (hintDisabledMessage) {
      Alert.alert('Hints', hintDisabledMessage);
      return;
    }
    if (hintsLoading) {
      Alert.alert('Hints', 'Hints are loading.');
      return;
    }
    if (hasHints) {
      press(showHint);
    } else {
      Alert.alert('Hints Unavailable', 'Hints could not be loaded. Check your connection and try again.');
    }
  }

  function handleClear() {
    press(() => Alert.alert('Clear Board', 'Are you sure you want to clear the board?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearBoard },
    ]));
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
          <Minimize2
            size={26}
            color={theme.text}
          />
        </Pressable>

        <Pressable
          onPress={handleHint}
          disabled={completed}
          style={[
            styles.button,
            hasGhosts && styles.buttonAccent,
            (completed || hintsLoading || !hasHints || !!hintDisabledMessage) &&
              styles.buttonDisabled,
          ]}
        >
          <Lightbulb size={26} color={theme.text} />
        </Pressable>

        <Pressable
          onPress={() => press(cycleTapMode)}
          disabled={completed}
          style={[styles.button, completed && styles.buttonDisabled]}
        >
          <TapModeIcon
            size={26}
            color={theme.text}
          />
        </Pressable>

        <Pressable
          onPress={() => press(undo)}
          disabled={undoDisabled}
          style={[styles.button, undoDisabled && styles.buttonDisabled]}
        >
          <Undo2
            size={26}
            color={theme.text}
          />
        </Pressable>

        <Pressable
          onPress={() => press(redo)}
          disabled={redoDisabled}
          style={[styles.button, redoDisabled && styles.buttonDisabled]}
        >
          <Redo2
            size={26}
            color={theme.text}
          />
        </Pressable>

        <Pressable
          onPress={handleClear}
          disabled={clearDisabled}
          style={[styles.button, clearDisabled && styles.buttonDisabled]}
        >
          <Trash2
            size={26}
            color={theme.text}
          />
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
      backgroundColor: theme.surface,
      shadowOffset: { width: 0, height: 4 },
      shadowColor: '#25292E',
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
      backgroundColor: theme.surface,
    },
    buttonAccent: {
      backgroundColor: theme.border,
    },
    buttonDisabled: {
      opacity: 0.4,
    },
  });
