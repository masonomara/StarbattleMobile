import React from 'react';
import type { ComponentType } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from './screens/HomeScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { PuzzleScreen } from './screens/PuzzleScreen';
import { StreaksScreen } from './screens/StreaksScreen';
import { AccountScreen } from './screens/AccountScreen';
import { useTheme } from './hooks/useTheme';

const Stack = createNativeStackNavigator();

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
        <Stack.Screen name="Home" component={HomeScreen as ComponentType} />
        <Stack.Screen
          name="Library"
          component={LibraryScreen as ComponentType}
        />
        <Stack.Screen name="Puzzle" component={PuzzleScreen as ComponentType} />
        <Stack.Screen
          name="Streaks"
          component={StreaksScreen as ComponentType}
        />
        <Stack.Screen
          name="Account"
          component={AccountScreen as ComponentType}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
