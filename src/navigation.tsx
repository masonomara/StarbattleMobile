import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeScreen } from './screens/HomeScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { PuzzleScreen } from './screens/PuzzleScreen';
import { StreaksScreen } from './screens/StreaksScreen';
import { SettingsModal } from './components/SettingsModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useTheme } from './hooks/useTheme';
import type { RootStackParamList } from './types/navigation';
// Side-effect import: loads the global ReactNavigation.RootParamList augmentation so
// useNavigation() is typed correctly app-wide without explicit type parameters.
import './types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

function WrappedHome(
  props: NativeStackScreenProps<RootStackParamList, 'Home'>,
) {
  return (
    <ErrorBoundary>
      <HomeScreen {...props} />
    </ErrorBoundary>
  );
}

function WrappedLibrary(
  props: NativeStackScreenProps<RootStackParamList, 'Library'>,
) {
  return (
    <ErrorBoundary onReset={() => props.navigation.goBack()}>
      <LibraryScreen {...props} />
    </ErrorBoundary>
  );
}

function WrappedPuzzle(
  props: NativeStackScreenProps<RootStackParamList, 'Puzzle'>,
) {
  return (
    <ErrorBoundary onReset={() => props.navigation.goBack()}>
      <PuzzleScreen {...props} />
    </ErrorBoundary>
  );
}

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
        <Stack.Screen name="Home" component={WrappedHome} />
        <Stack.Screen name="Library" component={WrappedLibrary} />
        <Stack.Screen name="Puzzle" component={WrappedPuzzle} />
        <Stack.Screen name="Streaks" component={StreaksScreen} />
      </Stack.Navigator>
      <SettingsModal />
    </NavigationContainer>
  );
}
