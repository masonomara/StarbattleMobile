import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from './screens/HomeScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { PuzzleScreen } from './screens/PuzzleScreen';
import { StreaksScreen } from './screens/StreaksScreen';
import { AccountScreen } from './screens/AccountScreen';
import { useTheme } from './hooks/useTheme';
import type { RootStackParamList } from './types/navigation';
import './types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

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
        <Stack.Screen name="Library" component={LibraryScreen} />
        <Stack.Screen name="Puzzle" component={PuzzleScreen} />
        <Stack.Screen name="Streaks" component={StreaksScreen} />
        <Stack.Screen name="Account" component={AccountScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
