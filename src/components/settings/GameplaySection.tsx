import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../shared/ui/Text';
import { ToggleRow } from '../../shared/ui/ToggleRow';
import { useSettingsStore } from '../../stores/settingsStore';
import { usePuzzleStore } from '../../features/puzzle/puzzleStore';
import { useTheme } from '../../shared/theme/useTheme';
import type { Theme } from '../../types';

export function GameplaySection() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const settings = useSettingsStore(s => s.settings);
  const updateSettings = useSettingsStore(s => s.updateSettings);
  const recomputeAutoMarks = usePuzzleStore(s => s.recomputeAutoMarks);

  return (
    <View style={styles.section}>
      <Text role="headline" style={styles.sectionTitle}>
        Gameplay
      </Text>
      <ToggleRow
        first
        label="Auto-X Neighbors"
        value={settings.autoXNeighbors}
        onToggle={v => {
          updateSettings({ autoXNeighbors: v });
          recomputeAutoMarks();
        }}
      />
      <ToggleRow
        label="Auto-X Rows & Columns"
        value={settings.autoXRowsCols}
        onToggle={v => {
          updateSettings({ autoXRowsCols: v });
          recomputeAutoMarks();
        }}
      />
      <ToggleRow
        label="Auto-X Regions"
        value={settings.autoXRegions}
        onToggle={v => {
          updateSettings({ autoXRegions: v });
          recomputeAutoMarks();
        }}
      />
      <ToggleRow
        label="Highlight Errors"
        value={settings.highlightErrors}
        onToggle={v => updateSettings({ highlightErrors: v })}
      />
      <ToggleRow
        label="Colored Regions"
        value={settings.coloredRegions}
        onToggle={v => updateSettings({ coloredRegions: v })}
      />
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    section: { marginTop: 40 },
    sectionTitle: {
      color: theme.text,
      marginBottom: 14,
    },
  });
