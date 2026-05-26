import React from 'react';
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeScreen } from './screens/HomeScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { PuzzleScreen } from './screens/PuzzleScreen';
import { StreaksModal } from './screens/StreaksModal';
import { SettingsModal } from './components/SettingsModal';
import { ResetPasswordModal } from './components/ResetPasswordModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useTheme } from './hooks/useTheme';
import { rgba } from './themes/ansi';
import type { RootStackParamList } from './types';
// type-only: pulls in global ReactNavigation.RootParamList augmentation so
// useNavigation() is typed correctly app-wide without explicit type parameters.
import './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function WrappedHome(
  props: NativeStackScreenProps<RootStackParamList, 'Home'>,
) {
  const theme = useTheme();
  return (
    <ErrorBoundary theme={theme}>
      <HomeScreen {...props} />
    </ErrorBoundary>
  );
}

function WrappedLibrary(
  props: NativeStackScreenProps<RootStackParamList, 'Library'>,
) {
  const theme = useTheme();
  return (
    <ErrorBoundary theme={theme} onReset={() => props.navigation.goBack()}>
      <LibraryScreen {...props} />
    </ErrorBoundary>
  );
}

function WrappedPuzzle(
  props: NativeStackScreenProps<RootStackParamList, 'Puzzle'>,
) {
  const theme = useTheme();
  return (
    <ErrorBoundary theme={theme} onReset={() => props.navigation.goBack()}>
      <PuzzleScreen {...props} />
    </ErrorBoundary>
  );
}

export function Navigation() {
  const theme = useTheme();
  const bgColor = rgba(theme.isDark ? theme.black : theme.white, 1);
  const navTheme = {
    ...(theme.isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.isDark ? DarkTheme : DefaultTheme).colors,
      background: bgColor,
    },
  };
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          statusBarStyle: theme.isDark ? 'light' : 'dark',
          contentStyle: { backgroundColor: bgColor },
        }}
      >
        <Stack.Screen name="Home" component={WrappedHome} />
        <Stack.Screen name="Library" component={WrappedLibrary} />
        <Stack.Screen name="Puzzle" component={WrappedPuzzle} />
      </Stack.Navigator>
      <SettingsModal />
      <ResetPasswordModal />
      <StreaksModal />
    </NavigationContainer>
  );
}
