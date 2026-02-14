import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from './screens/HomeScreen';
import { PackScreen } from './screens/PackScreen';
import { PuzzleScreen } from './screens/PuzzleScreen';

export type RootStackParams = {
  Home: undefined;
  Pack: { packId: string };
  Puzzle: { packId: string; puzzleIndex: number };
};

const Stack = createNativeStackNavigator<RootStackParams>();

export function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Pack"
          component={PackScreen}
          options={{ headerTransparent: true }}
        />
        <Stack.Screen
          name="Puzzle"
          component={PuzzleScreen}
          options={{
            // headerTransparent: true,
            title: '',
            headerTransparent: true,
            headerShadowVisible: false,
            headerBlurEffect: 'light',
            headerTintColor: '#000000',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
