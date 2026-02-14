import React from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Switch } from 'react-native';
import { X } from 'lucide-react-native';
import { useUserStore } from '../stores/userStore';
import { useTheme } from '../utils/useTheme';
import type { Theme } from '../utils/useTheme';
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
  theme,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  theme: Theme;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
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
  const settings = useUserStore(s => s.settings);
  const updateSettings = useUserStore(s => s.updateSettings);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Settings</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={24} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            Gameplay
          </Text>
          <ToggleRow
            label="Auto-X Neighbors"
            value={settings.autoXNeighbors}
            onToggle={v => updateSettings({ autoXNeighbors: v })}
            theme={theme}
          />
          <ToggleRow
            label="Auto-X Rows & Columns"
            value={settings.autoXRowsCols}
            onToggle={v => updateSettings({ autoXRowsCols: v })}
            theme={theme}
          />
          <ToggleRow
            label="Auto-X Regions"
            value={settings.autoXRegions}
            onToggle={v => updateSettings({ autoXRegions: v })}
            theme={theme}
          />
          <ToggleRow
            label="Highlight Errors"
            value={settings.highlightErrors}
            onToggle={v => updateSettings({ highlightErrors: v })}
            theme={theme}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            General
          </Text>
          <ToggleRow
            label="Show Timer"
            value={settings.showTimer}
            onToggle={v => updateSettings({ showTimer: v })}
            theme={theme}
          />
          <ToggleRow
            label="Haptics"
            value={settings.haptics}
            onToggle={v => updateSettings({ haptics: v })}
            theme={theme}
          />
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Theme</Text>
            <View style={styles.themeButtons}>
              {THEME_OPTIONS.map(opt => {
                const active = settings.theme === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => updateSettings({ theme: opt.value })}
                    style={[
                      styles.themeButton,
                      {
                        backgroundColor: active
                          ? theme.accent
                          : theme.innerBorder,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.themeButtonText,
                        { color: active ? theme.onAccent : theme.text },
                      ]}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING_XL,
    paddingTop: SPACING_XL,
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
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING_MD,
  },
  rowLabel: {
    fontSize: FONT_SIZE_LG,
  },
  themeButtons: {
    flexDirection: 'row',
    gap: SPACING_MD,
  },
  themeButton: {
    paddingHorizontal: SPACING_LG,
    paddingVertical: SPACING_MD,
    borderRadius: RADIUS_MD,
  },
  themeButtonText: {
    fontSize: FONT_SIZE_SM,
    fontWeight: FONT_WEIGHT_SEMIBOLD,
  },
});
