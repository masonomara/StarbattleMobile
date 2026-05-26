import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from './Text';
import type { ErrorBoundaryProps } from '../types';

interface State {
  hasError: boolean;
}

// Class component: React error boundaries cannot be implemented as functional components.
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Boundary caught:', error);
  }

  private handleReset = () => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  render() {
    const { theme } = this.props;
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}
        >
          <Text style={{ fontSize: 16, marginBottom: 16, textAlign: 'center' }}>
            Something went wrong.
          </Text>
          <Pressable
            style={{
              paddingVertical: 12,
              paddingHorizontal: 24,
              borderRadius: 8,
              backgroundColor: theme.blue,
            }}
            onPress={this.handleReset}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: '600',
                color: theme.text,
              }}
            >
              Try Again
            </Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
