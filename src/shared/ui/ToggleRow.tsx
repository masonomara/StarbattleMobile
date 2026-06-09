import React from 'react';
import { View, Switch } from 'react-native';
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
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        minHeight: 56,
        borderTopWidth: first ? 0 : 1,
        borderColor: theme.border,
      }}
    >
      <Text role="subhead" style={{ color: theme.text, fontWeight: '600' }}>
        {label}
      </Text>
      <View>
        <Switch
          style={{ transform: [{ scaleX: 0.88 }, { scaleY: 0.88 }] }}
          value={value}
          onValueChange={onToggle}
          trackColor={{ true: theme.blue, false: theme.border }}
          ios_backgroundColor={theme.border}
        />
      </View>
    </View>
  );
}
