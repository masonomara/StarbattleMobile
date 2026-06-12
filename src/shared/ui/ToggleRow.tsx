import React from 'react';
import { View, Switch, StyleSheet } from 'react-native';
import { Text } from './Text';
import { useTheme } from '../theme/useTheme';

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
      style={[
        styles.row,
        !first && styles.bordered,
        { borderColor: theme.border },
      ]}
    >
      <Text role="subhead" style={{ color: theme.text, fontWeight: 600 }}>
        {label}
      </Text>
      <View>
        <Switch
          style={styles.switch}
          value={value}
          onValueChange={onToggle}
          trackColor={{ true: theme.blue, false: theme.border }}
          ios_backgroundColor={theme.border}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 54,
  },
  bordered: {
    borderTopWidth: 1,
  },
  switch: {
    transform: [{ scaleX: 0.87 }, { scaleY: 0.87 }],
  },
});
