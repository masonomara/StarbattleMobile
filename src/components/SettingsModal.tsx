import React, { useMemo } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Switch } from 'react-native';
import { X } from 'lucide-react-native';
import { useUserStore } from '../stores/userStore';
import { useTheme } from '../hooks/useTheme';
import type { Theme } from '../types/theme';
import type { UserSettings } from '../types/state';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const THEME_OPTIONS: { label: string; value: UserSettings['theme'] }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

function ToggleRow({
  label,
  value,
  onToggle,
  styles,
  theme,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  styles: any;
  theme: Theme;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: theme.innerBorder, true: theme.accent }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

export function SettingsModal({ visible, onClose }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const settings = useUserStore(s => s.settings);
  const updateSettings = useUserStore(s => s.updateSettings);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={24} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gameplay</Text>
          <ToggleRow
            label="Auto-X Neighbors"
            value={settings.autoXNeighbors}
            onToggle={v => updateSettings({ autoXNeighbors: v })}
            styles={styles}
            theme={theme}
          />
          <ToggleRow
            label="Auto-X Rows & Columns"
            value={settings.autoXRowsCols}
            onToggle={v => updateSettings({ autoXRowsCols: v })}
            styles={styles}
            theme={theme}
          />
          <ToggleRow
            label="Auto-X Regions"
            value={settings.autoXRegions}
            onToggle={v => updateSettings({ autoXRegions: v })}
            styles={styles}
            theme={theme}
          />
          <ToggleRow
            label="Highlight Errors"
            value={settings.highlightErrors}
            onToggle={v => updateSettings({ highlightErrors: v })}
            styles={styles}
            theme={theme}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>General</Text>
          <ToggleRow
            label="Show Timer"
            value={settings.showTimer}
            onToggle={v => updateSettings({ showTimer: v })}
            styles={styles}
            theme={theme}
          />
          <ToggleRow
            label="Hide Toolbar"
            value={settings.hideToolbar}
            onToggle={v => updateSettings({ hideToolbar: v })}
            styles={styles}
            theme={theme}
          />
          <ToggleRow
            label="Haptics"
            value={settings.haptics}
            onToggle={v => updateSettings({ haptics: v })}
            styles={styles}
            theme={theme}
          />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Theme</Text>
            <View style={styles.themeButtons}>
              {THEME_OPTIONS.map(opt => {
                const active = settings.theme === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => updateSettings({ theme: opt.value })}
                    style={active ? styles.themeButtonActive : styles.themeButtonInactive}
                  >
                    <Text
                      style={
                        active
                          ? styles.themeButtonTextActive
                          : styles.themeButtonTextInactive
                      }
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: theme.spacingXl,
      paddingTop: theme.spacingXl,
      backgroundColor: theme.bg,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacingXl,
    },
    title: {
      fontSize: theme.fontSizeLg,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    section: {
      marginBottom: theme.spacingXl,
    },
    sectionTitle: {
      fontSize: theme.fontSizeSm,
      fontWeight: theme.fontWeightSemibold,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: theme.spacingMd,
      color: theme.textSecondary,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: theme.spacingMd,
    },
    rowLabel: {
      fontSize: theme.fontSizeLg,
      color: theme.text,
    },
    themeButtons: {
      flexDirection: 'row',
      gap: theme.spacingMd,
    },
    themeButtonActive: {
      paddingHorizontal: theme.spacingLg,
      paddingVertical: theme.spacingMd,
      borderRadius: theme.radiusMd,
      backgroundColor: theme.accent,
    },
    themeButtonInactive: {
      paddingHorizontal: theme.spacingLg,
      paddingVertical: theme.spacingMd,
      borderRadius: theme.radiusMd,
      backgroundColor: theme.innerBorder,
    },
    themeButtonTextActive: {
      fontSize: theme.fontSizeSm,
      fontWeight: theme.fontWeightSemibold,
      color: theme.onAccent,
    },
    themeButtonTextInactive: {
      fontSize: theme.fontSizeSm,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
  });
