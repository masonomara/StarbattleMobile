import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from './screens/HomeScreen';
import { PackScreen } from './screens/PackScreen';
import { PuzzleScreen } from './screens/PuzzleScreen';

import type { RootStackParams } from './types/navigation';
import { useTheme } from './hooks/useTheme';

const Stack = createNativeStackNavigator<RootStackParams>();

export function Navigation() {
  const theme = useTheme();

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          statusBarStyle: theme.isDark ? 'light' : 'dark',
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Pack" component={PackScreen} />
        <Stack.Screen name="Puzzle" component={PuzzleScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
