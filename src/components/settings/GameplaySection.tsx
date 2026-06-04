import React from 'react';
import { View, Switch, StyleSheet } from 'react-native';
import { Text } from '../Text';
import { useSettingsStore } from '../../stores/settingsStore';
import { usePuzzleStore } from '../../stores/puzzleStore';
import { useTheme } from '../../hooks/useTheme';
import type { Theme } from '../../types';

export function ToggleRow({
  label,
  value,
  onToggle,
  first,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  first?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        minHeight: 56,
        borderTopWidth: first ? 0 : 1,
        borderColor: theme.border,
      }}
    >
      <Text style={{ fontSize: 17, fontWeight: '600', color: theme.text }}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ true: theme.blue, false: theme.border }}
      />
    </View>
  );
}

export function GameplaySection() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const settings = useSettingsStore(s => s.settings);
  const updateSettings = useSettingsStore(s => s.updateSettings);
  const recomputeAutoMarks = usePuzzleStore(s => s.recomputeAutoMarks);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Gameplay</Text>
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
      fontSize: 20,
      color: theme.text,
      lineHeight: 22,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: '900',
      letterSpacing: -0.2,
      marginBottom: 14,
    },
  });
