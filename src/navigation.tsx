import React, { useState } from 'react';
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import BootSplash from 'react-native-bootsplash';
import { HomeScreen } from './features/library/HomeScreen';
import { LibraryScreen } from './features/library/LibraryScreen';
import { PuzzleScreen } from './features/puzzle/PuzzleScreen';
import { ArchivePackScreen } from './features/library/ArchivePackScreen';
import { StreaksModal } from './features/library/StreaksModal';
import { SettingsModal } from './components/SettingsModal';
import { ResetPasswordModal } from './components/ResetPasswordModal';
import { ErrorBoundary } from './shared/ui/ErrorBoundary';
import { useTheme } from './shared/theme/useTheme';
import { hasSeenTutorial } from './stores/settingsStore';
import type { RootStackParamList } from './types';
// type-only: pulls in global ReactNavigation.RootParamList augmentation so
// useNavigation() is typed correctly app-wide without explicit type parameters.
import './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Wraps a screen in an ErrorBoundary. `resetOnGoBack` controls whether the
// boundary's "Try Again" pops the stack (Library/Puzzle/ArchivePack) or just
// clears the error in place (Home/Tutorial, which are roots with nowhere to
// pop to). The explicit <Name> type arg keeps screen props fully inferred.
function withErrorBoundary<Name extends keyof RootStackParamList>(
  Screen: React.ComponentType<NativeStackScreenProps<RootStackParamList, Name>>,
  resetOnGoBack = false,
) {
  return function WrappedScreen(
    props: NativeStackScreenProps<RootStackParamList, Name>,
  ) {
    const theme = useTheme();
    return (
      <ErrorBoundary
        theme={theme}
        onReset={resetOnGoBack ? () => props.navigation.goBack() : undefined}
      >
        <Screen {...props} />
      </ErrorBoundary>
    );
  };
}

const WrappedHome = withErrorBoundary<'Home'>(HomeScreen);
const WrappedLibrary = withErrorBoundary<'Library'>(LibraryScreen, true);
const WrappedPuzzle = withErrorBoundary<'Puzzle'>(PuzzleScreen, true);
const WrappedArchivePack = withErrorBoundary<'ArchivePack'>(
  ArchivePackScreen,
  true,
);
const WrappedTutorial = withErrorBoundary<'Tutorial'>(PuzzleScreen);

export function Navigation() {
  const theme = useTheme();
  const bgColor = theme.background;
  const baseNavTheme = theme.isDark ? DarkTheme : DefaultTheme;
  const [initialRouteName] = useState<keyof RootStackParamList>(() =>
    hasSeenTutorial() ? 'Home' : 'Tutorial',
  );
  const navTheme = {
    ...baseNavTheme,
    colors: { ...baseNavTheme.colors, background: bgColor },
  };
  // Hide the native bootsplash only after the navigator's first screen is
  // mounted, then wait one frame so the themed content has actually painted —
  // fading the splash any earlier reveals an unpainted frame (white flash).
  const onReady = () => {
    requestAnimationFrame(() => {
      BootSplash.hide({ fade: true }).catch(() => {});
    });
  };

  return (
    <NavigationContainer theme={navTheme} onReady={onReady}>
      <Stack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{
          headerShown: false,
          statusBarStyle: theme.isDark ? 'light' : 'dark',
          contentStyle: { backgroundColor: bgColor },
        }}
      >
        <Stack.Screen name="Home" component={WrappedHome} />
        <Stack.Screen name="Library" component={WrappedLibrary} />
        <Stack.Screen name="Puzzle" component={WrappedPuzzle} />
        <Stack.Screen name="ArchivePack" component={WrappedArchivePack} />
        <Stack.Screen name="Tutorial" component={WrappedTutorial} />
      </Stack.Navigator>
      <SettingsModal />
      <ResetPasswordModal />
      <StreaksModal />
    </NavigationContainer>
  );
}
