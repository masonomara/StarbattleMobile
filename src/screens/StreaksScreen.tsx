import React from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../hooks/useTheme';
import type { RootStackParamList } from '../types/navigation';

export function StreaksScreen(_props: NativeStackScreenProps<RootStackParamList, 'Streaks'>) {
  const theme = useTheme();
  return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
}
