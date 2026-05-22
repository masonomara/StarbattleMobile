import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme, type Theme } from '../hooks/useTheme';
import { useAuthStore } from '../stores/authStore';
import { purchasePremium, purchasePack } from '../utils/payments';
import type { PaywallContext } from '../types/user';

type Props = {
  visible: boolean;
  context: PaywallContext | null;
  onClose: () => void;
  onPurchaseSuccess?: () => void;
  onNavigateToAccount: () => void;
};

export function PaywallModal({
  visible,
  context,
  onClose,
  onPurchaseSuccess,
  onNavigateToAccount,
}: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const isAnonymous = useAuthStore(s => s.isAnonymous);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePurchasePremium() {
    setError(null);
    setLoading(true);
    try {
      await purchasePremium();
      onPurchaseSuccess?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Purchase failed');
    } finally {
      setLoading(false);
    }
  }

  async function handlePurchasePack(packId: string, storagePath: string) {
    setError(null);
    setLoading(true);
    try {
      await purchasePack(packId, storagePath);
      onPurchaseSuccess?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Purchase failed');
    } finally {
      setLoading(false);
    }
  }

  function handleNavigateToAccount() {
    onClose();
    onNavigateToAccount();
  }

  if (!visible || !context) return null;

  const renderContent = () => {
    if (context.type === 'sequential') {
      return (
        <>
          <Text style={styles.title}>Puzzle Locked</Text>
          <Text style={styles.body}>
            Complete the previous puzzle to unlock this one.
          </Text>
          <Pressable
            style={[styles.primaryButton, loading && styles.disabled]}
            onPress={handlePurchasePremium}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.onAccent} />
            ) : (
              <Text style={styles.primaryButtonText}>
                Unlock All with Premium · $5.99
              </Text>
            )}
          </Pressable>
        </>
      );
    }

    if (context.type === 'paid-pack') {
      if (isAnonymous) {
        return (
          <>
            <Text style={styles.title}>{context.packName}</Text>
            <Text style={styles.body}>
              Create an account to purchase this pack for $
              {context.priceUsd.toFixed(2)}.
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={handleNavigateToAccount}
            >
              <Text style={styles.primaryButtonText}>Create Account</Text>
            </Pressable>
          </>
        );
      }

      return (
        <>
          <Text style={styles.title}>{context.packName}</Text>
          <Pressable
            style={[styles.primaryButton, loading && styles.disabled]}
            onPress={() =>
              handlePurchasePack(context.packId, context.storagePath)
            }
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.onAccent} />
            ) : (
              <Text style={styles.primaryButtonText}>
                Buy Pack · ${context.priceUsd.toFixed(2)}
              </Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, loading && styles.disabled]}
            onPress={handlePurchasePremium}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>
              Buy Premium · $5.99 · All Packs
            </Text>
          </Pressable>
        </>
      );
    }

    return null;
  };

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.sheet}>
        <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
          <X size={20} color={theme.textSecondary} />
        </Pressable>
        {renderContent()}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: theme.spacingXl,
      paddingTop: theme.spacingXl,
      paddingBottom: 48,
      gap: theme.spacingMd,
    },
    closeButton: {
      alignSelf: 'flex-end',
      padding: 4,
    },
    title: {
      fontSize: 20,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
      marginBottom: 4,
    },
    body: {
      fontSize: theme.fontSizeMd,
      color: theme.textSecondary,
      lineHeight: 22,
      marginBottom: theme.spacingMd,
    },
    primaryButton: {
      height: 52,
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.accent,
    },
    primaryButtonText: {
      fontSize: theme.fontSizeMd,
      fontWeight: theme.fontWeightSemibold,
      color: theme.onAccent,
    },
    secondaryButton: {
      height: 52,
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.highlight,
    },
    secondaryButtonText: {
      fontSize: theme.fontSizeMd,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    disabled: { opacity: 0.6 },
    error: {
      fontSize: theme.fontSizeSm,
      color: theme.markColor,
      textAlign: 'center',
    },
  });
