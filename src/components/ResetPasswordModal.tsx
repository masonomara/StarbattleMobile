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
import { Header } from './Header';
import { useAuthStore } from '../stores/authStore';
import { useTheme } from '../hooks/useTheme';
import { rgba } from '../themes/ansi';
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
        <Header
          absolute={false}
          center={<Text style={styles.title}>New Password</Text>}
        />
        <View style={styles.body}>
          <Text style={styles.description}>
            Choose a new password for your account.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="New password"
            placeholderTextColor={rgba(theme.isDark ? theme.lightGray : theme.gray, 1)}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            autoFocus
          />
          <Text style={[styles.hint, password.length >= 6 && styles.hintMet]}>
            At least 6 characters
          </Text>
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            style={[styles.button, (password.length < 6 || loading) && styles.disabled]}
            onPress={handleSubmit}
            disabled={password.length < 6 || loading}
          >
            {loading ? (
              <ActivityIndicator color={rgba(theme.isDark ? theme.black : theme.white, 1)} />
            ) : (
              <Text style={styles.buttonText}>Set Password</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => {
  const bg  = theme.isDark ? theme.black  : theme.white;
  const card = theme.isDark ? theme.gray : theme.white;
  const fg  = theme.isDark ? theme.white : theme.black;
  const dim = theme.isDark ? theme.lightGray : theme.gray;
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: theme.spacingXl,
      backgroundColor: rgba(card, 1),
    },
    title: {
      fontSize: theme.fontSizeBody,
      fontWeight: theme.fontWeightSemibold,
      color: rgba(fg, 1),
    },
    body: {
      paddingHorizontal: theme.spacingXl,
      paddingTop: theme.spacingXl,
      gap: theme.spacingMd,
    },
    description: {
      fontSize: theme.fontSizeCallout,
      color: rgba(dim, 1),
      lineHeight: 22,
    },
    input: {
      height: 52,
      borderRadius: theme.radiusMd,
      paddingHorizontal: theme.spacingLg,
      backgroundColor: rgba(bg, 1),
      color: rgba(fg, 1),
      fontSize: theme.fontSizeCallout,
    },
    button: {
      height: 52,
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: rgba(theme.lightBlue, 1),
    },
    buttonText: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: rgba(bg, 1),
    },
    disabled: { opacity: 0.6 },
    hint: {
      fontSize: theme.fontSizeSubhead,
      color: rgba(theme.isDark ? theme.lightGray : theme.gray, 1),
    },
    hintMet: {
      color: rgba(theme.lightBlue, 1),
    },
    error: {
      fontSize: theme.fontSizeSubhead,
      color: rgba(theme.lightRed, 1),
      textAlign: 'center',
    },
  });
};
