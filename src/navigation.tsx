import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from './screens/HomeScreen';
import { PackScreen } from './screens/PackScreen';
import { PuzzleScreen } from './screens/PuzzleScreen';

import type { RootStackParams } from './types/navigation';
import { useTheme } from './utils/useTheme';

const Stack = createNativeStackNavigator<RootStackParams>();

export function Navigation() {
  const theme = useTheme();

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerBackButtonDisplayMode: 'default',
          statusBarStyle: theme.isDark ? 'light' : 'dark',
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false, headerTintColor: theme.text }}
        />
        <Stack.Screen
          name="Pack"
          component={PackScreen}
          options={{ headerTransparent: true, headerTintColor: theme.text }}
        />
        <Stack.Screen
          name="Puzzle"
          component={PuzzleScreen}
          options={{
            title: '',
            headerTintColor: theme.text,

            headerTransparent: true,
            headerShadowVisible: false,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
