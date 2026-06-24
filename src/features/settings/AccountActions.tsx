import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Pressable, StyleSheet, Alert } from 'react-native';
import { Text } from '../../shared/ui/Text';
import { useAuthStore } from '../../shared/stores/authStore';
import { useTheme } from '../../shared/theme/useTheme';
import { useAsyncAction } from '../../shared/hooks/useAsyncAction';
import { restorePurchases } from '../../shared/lib/payments';
import type { Theme } from '../../types';

// Account utility actions (restore / sign out / delete). Rendered at the bottom
// of the settings modal, beneath the color swatches, rather than inline in the
// AccountSection header block.
export function AccountActions() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = createStyles(theme);

  const isAnonymous = useAuthStore(s => s.isAnonymous);
  const signOut = useAuthStore(s => s.signOut);
  const deleteAccount = useAuthStore(s => s.deleteAccount);

  const { loading, error, run: withLoading } = useAsyncAction();

  function confirmDeleteAccount() {
    Alert.alert(t('account.deleteTitle'), t('account.deleteBody'), [
      { text: t('account.deleteCancel'), style: 'cancel' },
      {
        text: t('account.deleteConfirm'),
        style: 'destructive',
        onPress: () => withLoading(deleteAccount),
      },
    ]);
  }

  // Restore is available to everyone — a purchase made anonymously must be
  // recoverable without an account (App Review 5.1.1(v) / required restore path).
  // Sign-out and delete only apply to a signed-in account.
  const restoreButton = (
    <Pressable
      style={[styles.secondaryButton, loading && styles.disabled]}
      onPress={() => {
        let wasPremium = false;
        withLoading(
          async () => {
            wasPremium = await restorePurchases();
          },
          () =>
            Alert.alert(
              t('account.restoredTitle'),
              wasPremium ? t('account.restoredFound') : t('account.restoredNone'),
            ),
        );
      }}
      disabled={loading}
    >
      <Text role="callout" style={styles.secondaryButtonText}>
        {t('account.restorePurchases')}
      </Text>
    </Pressable>
  );

  if (isAnonymous) {
    return (
      <View style={styles.accountActions}>
        {restoreButton}
        {error && (
          <Text role="subhead" style={styles.error}>
            {error}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.accountActions}>
      {restoreButton}

      <Pressable
        style={[styles.secondaryButton, loading && styles.disabled]}
        onPress={() => withLoading(signOut)}
        disabled={loading}
      >
        <Text role="callout" style={styles.secondaryButtonText}>
          {t('account.signOut')}
        </Text>
      </Pressable>

      <Pressable
        style={[styles.destructiveButton, loading && styles.disabled]}
        onPress={confirmDeleteAccount}
        disabled={loading}
      >
        <Text role="callout" style={styles.destructiveButtonText}>
          {t('account.deleteAccount')}
        </Text>
      </Pressable>

      {error && (
        <Text role="subhead" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    accountActions: { gap: 12, marginTop: 40 },
    secondaryButton: {
      height: 48,
      flex: 1,
      borderRadius: 800,
      borderWidth: 2,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
    },
    secondaryButtonText: { color: theme.text, fontWeight: '600' },
    destructiveButton: {
      height: 48,
      flex: 1,
      borderRadius: 800,
      borderWidth: 2,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
    },
    destructiveButtonText: {
      color: theme.red,
      fontWeight: '600',
    },
    disabled: { opacity: 0.6 },
    error: {
      color: theme.red,
      textAlign: 'center',
      marginTop: 14,
      fontWeight: '500',
    },
  });
