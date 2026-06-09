import React from 'react';
import {
  View,
  Pressable,
  Image,
  useColorScheme,
  StyleSheet,
} from 'react-native';
import { Text } from '../../shared/ui/Text';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTheme } from '../../shared/theme/useTheme';
import { PALETTES, PALETTE_NAMES } from '../../shared/theme/palettes';
import { ToggleRow } from '../../shared/ui/ToggleRow';
import type { Theme, UserSettings } from '../../types';

const PALETTE_ICONS: Record<
  string,
  { light: ReturnType<typeof require>; dark: ReturnType<typeof require> }
> = {
  original: {
    light: require('../../../assets/icons/original-light.png'),
    dark: require('../../../assets/icons/original-dark.png'),
  },
  primer: {
    light: require('../../../assets/icons/primer-light.png'),
    dark: require('../../../assets/icons/primer-dark.png'),
  },
  gruvbox: {
    light: require('../../../assets/icons/gruvbox-light.png'),
    dark: require('../../../assets/icons/gruvbox-dark.png'),
  },
  rosePine: {
    light: require('../../../assets/icons/rosePine-light.png'),
    dark: require('../../../assets/icons/rosePine-dark.png'),
  },
  seoul256: {
    light: require('../../../assets/icons/seoul256-light.png'),
    dark: require('../../../assets/icons/seoul256-dark.png'),
  },
  tokyoNight: {
    light: require('../../../assets/icons/tokyoNight-light.png'),
    dark: require('../../../assets/icons/tokyoNight-dark.png'),
  },
};

const THEME_OPTIONS: { label: string; value: UserSettings['theme'] }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

export function AppearanceSection() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const systemScheme = useColorScheme();
  const settings = useSettingsStore(s => s.settings);
  const updateSettings = useSettingsStore(s => s.updateSettings);

  const isCurrentlyDark =
    settings.theme === 'dark'
      ? true
      : settings.theme === 'light'
      ? false
      : systemScheme === 'dark';

  const paletteRows: (typeof PALETTE_NAMES)[number][][] = [];
  for (let i = 0; i < PALETTE_NAMES.length; i += 3) {
    paletteRows.push(PALETTE_NAMES.slice(i, i + 3));
  }

  return (
    <>
      <View style={styles.section}>
        <Text role="headline" style={styles.sectionTitle}>General</Text>
        <ToggleRow
          first
          label="Always show timer"
          value={settings.alwaysShowTimer}
          onToggle={v => updateSettings({ alwaysShowTimer: v })}
        />
        <ToggleRow
          label="Always show toolbar"
          value={settings.alwaysShowToolbar}
          onToggle={v => updateSettings({ alwaysShowToolbar: v })}
        />
        <ToggleRow
          label="Haptics"
          value={settings.haptics}
          onToggle={v => updateSettings({ haptics: v })}
        />
        <View style={styles.themeRow}>
          <Text role="body" style={styles.rowLabel}>Theme</Text>
          <View style={styles.themeButtons}>
            {THEME_OPTIONS.map(option => {
              const active = settings.theme === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => updateSettings({ theme: option.value })}
                  style={[
                    styles.themeButton,
                    active && styles.themeButtonActive,
                  ]}
                >
                  <Text
                    role="subhead"
                    style={[
                      styles.themeButtonLabel,
                      active && styles.themeButtonLabelActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text role="headline" style={styles.sectionTitle}>Color Theme</Text>
        <View style={styles.swatchGrid}>
          {paletteRows.map((row, rowIdx) => (
            <View key={rowIdx} style={styles.swatchRow}>
              {row.map(name => {
                const active = settings.palette === name;
                return (
                  <Pressable
                    key={name}
                    onPress={() => updateSettings({ palette: name })}
                    style={[
                      styles.swatchCard,
                      active && { borderColor: theme.text },
                    ]}
                  >
                    <Image
                      source={
                        PALETTE_ICONS[name][isCurrentlyDark ? 'dark' : 'light']
                      }
                      style={[styles.swatchImage]}
                    />
                    <Text role="footnote" style={styles.swatchLabel}>
                      {PALETTES[name].label}
                    </Text>
                  </Pressable>
                );
              })}
              {row.length < 3 &&
                Array.from({ length: 3 - row.length }).map((_, j) => (
                  <View key={j} style={styles.swatchCard} />
                ))}
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    section: { marginTop: 40 },
    sectionTitle: {
      color: theme.text,
      marginBottom: 14,
    },
    themeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: 56,
      borderTopWidth: 1,
      borderColor: theme.border,
    },
    rowLabel: { color: theme.text },
    themeButtons: {
      flexDirection: 'row',
      gap: 6,
    },
    themeButton: {
      paddingHorizontal: 14,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.border,
    },
    themeButtonActive: {
      backgroundColor: theme.blue,
    },
    themeButtonLabel: {
      color: theme.text,
    },
    themeButtonLabelActive: {
      color: theme.background,
    },
    swatchGrid: { gap: 12 },
    swatchRow: { flexDirection: 'row', gap: 12 },
    swatchCard: {
      flex: 1,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: theme.border,
      overflow: 'hidden',
      alignItems: 'center',
      padding: 14,
    },
    swatchImage: {
      width: '100%',
      height: 'auto',
      aspectRatio: 1,
      borderRadius: 0,
      borderWidth: 1,
      borderColor: theme.border,
    },
    swatchLabel: {
      color: theme.text,
      paddingTop: 7,
      marginBottom: -7,
    },
  });
