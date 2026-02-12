import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../hooks/useTheme';
import type { RootStackParamList } from '../types';
import HomeScreen from '../screens/HomeScreen';
import PackListScreen from '../screens/PackListScreen';
import PuzzleSelectScreen from '../screens/PuzzleSelectScreen';
import PuzzleScreen from '../screens/PuzzleScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { colors, isDark } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        animation: 'default',
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PackList"
        component={PackListScreen}
        options={{ title: 'Puzzle Packs' }}
      />
      <Stack.Screen
        name="PuzzleSelect"
        component={PuzzleSelectScreen}
        options={{ title: 'Puzzles' }}
      />
      <Stack.Screen
        name="Puzzle"
        component={PuzzleScreen}
        options={{
          title: '',
          headerBackTitle: 'Back',
        }}
      />
    </Stack.Navigator>
  );
}
