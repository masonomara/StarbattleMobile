import React from 'react';
import {
  View,
  Pressable,
  Image,
  useColorScheme,
  StyleSheet,
} from 'react-native';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { Text } from '../Text';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTheme } from '../../hooks/useTheme';
import { PALETTES, PALETTE_NAMES } from '../../themes/palettes';
import { ToggleRow } from './GameplaySection';
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
        <Text style={styles.sectionTitle}>General</Text>
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
          <Text style={styles.rowLabel}>Theme</Text>
          <SegmentedControl
            values={THEME_OPTIONS.map(o => o.label)}
            selectedIndex={THEME_OPTIONS.findIndex(
              o => o.value === settings.theme,
            )}
            onChange={e =>
              updateSettings({
                theme: THEME_OPTIONS[e.nativeEvent.selectedSegmentIndex].value,
              })
            }
            style={styles.themeSegment}
            tintColor="#FFFFFF"
            backgroundColor={theme.border}
            fontStyle={{
              color: isCurrentlyDark ? theme.background : theme.text,
              fontSize: 15,
              fontWeight: '700',
              fontFamily: 'Karla',
            }}
            activeFontStyle={{
              color: isCurrentlyDark ? theme.background : theme.text,
              fontSize: 15,
              fontWeight: '700',
              fontFamily: 'Karla',
            }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Color Theme</Text>
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
                    <Text style={styles.swatchLabel}>
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
      fontSize: 20,
      color: theme.text,
      lineHeight: 22,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: '900',
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
    rowLabel: { fontSize: 17, fontWeight: '600', color: theme.text },
    themeSegment: {
      width: 195,
      height: 32,
      borderRadius: 18,
    },
    swatchGrid: { gap: 12 },
    swatchRow: { flexDirection: 'row', gap: 12 },
    swatchCard: {
      flex: 1,
      borderRadius: 4,
      borderWidth: 1,
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
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
      paddingTop: 10,
      marginBottom: -4,
    },
  });
