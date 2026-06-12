import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../shared/ui/Text';
import { ToggleRow } from '../../shared/ui/ToggleRow';
import { useSettingsStore } from '../../shared/stores/settingsStore';
import { usePuzzleStore } from '../puzzle/puzzleStore';
import { useTheme } from '../../shared/theme/useTheme';
import type { Theme } from '../../types';

export function GameplaySection() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = createStyles(theme);
  const settings = useSettingsStore(s => s.settings);
  const updateSettings = useSettingsStore(s => s.updateSettings);
  const recomputeAutoMarks = usePuzzleStore(s => s.recomputeAutoMarks);

  return (
    <View style={styles.section}>
      <Text role="headline" style={styles.sectionTitle}>
        {t('settings.gameplay')}
      </Text>
      <ToggleRow
        first
        label={t('settings.autoXNeighbors')}
        value={settings.autoXNeighbors}
        onToggle={v => {
          updateSettings({ autoXNeighbors: v });
          recomputeAutoMarks();
        }}
      />
      <ToggleRow
        label={t('settings.autoXRowsCols')}
        value={settings.autoXRowsCols}
        onToggle={v => {
          updateSettings({ autoXRowsCols: v });
          recomputeAutoMarks();
        }}
      />
      <ToggleRow
        label={t('settings.autoXRegions')}
        value={settings.autoXRegions}
        onToggle={v => {
          updateSettings({ autoXRegions: v });
          recomputeAutoMarks();
        }}
      />
      <ToggleRow
        label={t('settings.highlightErrors')}
        value={settings.highlightErrors}
        onToggle={v => updateSettings({ highlightErrors: v })}
      />
      <ToggleRow
        label={t('settings.coloredRegions')}
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
