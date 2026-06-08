import React, { useState } from 'react';
import {
  Modal,
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Text } from './Text';
import { useAuthStore } from '../stores/authStore';
import { useTheme } from '../hooks/useTheme';
import { useAsyncAction } from '../hooks/useAsyncAction';
import type { Theme } from '../types';

export function ResetPasswordModal() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const isPasswordRecovery = useAuthStore(s => s.isPasswordRecovery);
  const setNewPassword = useAuthStore(s => s.setNewPassword);

  const [password, setPassword] = useState('');
  const { loading, error, run: withLoading } = useAsyncAction();

  async function handleSubmit() {
    if (password.length < 6) return;
    await withLoading(async () => {
      await setNewPassword(password);
      setPassword('');
    });
  }

  return (
    <Modal
      visible={isPasswordRecovery}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        <View style={styles.modalHeader}>
          <Text role="headline" style={styles.title}>New Password</Text>
        </View>
        <View style={styles.body}>
          <Text role="body" style={styles.description}>
            Choose a new password for your account.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="New password"
            placeholderTextColor={theme.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            autoFocus
          />
          <Text role="body" style={[styles.hint, password.length >= 6 && styles.hintMet]}>
            At least 6 characters
          </Text>
          {error && <Text role="subhead" style={styles.error}>{error}</Text>}
          <Pressable
            style={[styles.button, (password.length < 6 || loading) && styles.disabled]}
            onPress={handleSubmit}
            disabled={password.length < 6 || loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <Text role="headline" style={styles.buttonText}>Set Password</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: theme.spacingXl,
      backgroundColor: theme.surface,
    },
    modalHeader: {
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    title: {
      color: theme.text,
    },
    body: {
      paddingHorizontal: theme.spacingXl,
      paddingTop: theme.spacingXl,
      gap: theme.spacingMd,
    },
    description: {
      color: theme.textSecondary,
    },
    input: {
      height: 52,
      borderRadius: theme.radiusMd,
      paddingHorizontal: theme.spacingLg,
      backgroundColor: theme.background,
      color: theme.text,
      fontSize: theme.type.body.fontSize,
    },
    button: {
      height: 52,
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.blue,
    },
    buttonText: {
      color: theme.background,
    },
    disabled: { opacity: 0.6 },
    hint: {
      color: theme.textSecondary,
    },
    hintMet: {
      color: theme.blue,
    },
    error: {
      color: theme.red,
      textAlign: 'center',
    },
  });
};
