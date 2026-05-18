import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../hooks/useTheme';

export function StreaksScreen() {
  const theme = useTheme();
  return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
}
