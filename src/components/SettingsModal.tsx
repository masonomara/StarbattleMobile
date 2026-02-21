import React, { useMemo } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Switch } from 'react-native';
import { X } from 'lucide-react-native';
import { useUserStore } from '../stores/userStore';
import { useTheme } from '../hooks/useTheme';
import type { Theme } from '../types/theme';
import type { UserSettings } from '../types/state';
import {
  SPACING_MD,
  SPACING_LG,
  SPACING_XL,
  RADIUS_MD,
  FONT_SIZE_SM,
  FONT_SIZE_LG,
  FONT_WEIGHT_SEMIBOLD,
} from '../utils/constants';

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
  styles: ReturnType<typeof createStyles>;
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
      paddingHorizontal: SPACING_XL,
      paddingTop: SPACING_XL,
      backgroundColor: theme.bg,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING_XL,
    },
    title: {
      fontSize: FONT_SIZE_LG,
      fontWeight: FONT_WEIGHT_SEMIBOLD,
      color: theme.text,
    },
    section: {
      marginBottom: SPACING_XL,
    },
    sectionTitle: {
      fontSize: FONT_SIZE_SM,
      fontWeight: FONT_WEIGHT_SEMIBOLD,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: SPACING_MD,
      color: theme.textSecondary,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: SPACING_MD,
    },
    rowLabel: {
      fontSize: FONT_SIZE_LG,
      color: theme.text,
    },
    themeButtons: {
      flexDirection: 'row',
      gap: SPACING_MD,
    },
    themeButtonActive: {
      paddingHorizontal: SPACING_LG,
      paddingVertical: SPACING_MD,
      borderRadius: RADIUS_MD,
      backgroundColor: theme.accent,
    },
    themeButtonInactive: {
      paddingHorizontal: SPACING_LG,
      paddingVertical: SPACING_MD,
      borderRadius: RADIUS_MD,
      backgroundColor: theme.innerBorder,
    },
    themeButtonTextActive: {
      fontSize: FONT_SIZE_SM,
      fontWeight: FONT_WEIGHT_SEMIBOLD,
      color: theme.onAccent,
    },
    themeButtonTextInactive: {
      fontSize: FONT_SIZE_SM,
      fontWeight: FONT_WEIGHT_SEMIBOLD,
      color: theme.text,
    },
  });
