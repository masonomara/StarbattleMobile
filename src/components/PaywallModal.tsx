import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useTheme } from '../hooks/useTheme';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { purchasePremium, purchasePack } from '../utils/payments';
import type { Theme } from '../types/theme';
import type { PaywallModalProps } from '../types/components';

export function PaywallModal({
  context,
  onClose,
  onPurchaseSuccess,
}: PaywallModalProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const isAnonymous = useAuthStore(s => s.isAnonymous);
  const { loading, error, run } = useAsyncAction();

  if (!context) return null;

  function purchase(fn: () => Promise<unknown>) {
    run(fn, () => { onPurchaseSuccess?.(); onClose(); });
  }

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
            onPress={() => purchase(purchasePremium)}
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
              onPress={() => {
                onClose();
                useSettingsStore.getState().openSettings();
              }}
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
              purchase(() => purchasePack(context.packId, context.storagePath))
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
            onPress={() => purchase(purchasePremium)}
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
    // box-none lets the sheet receive touches while the absoluteFill Pressable behind it closes on tap-outside.
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
      backgroundColor: theme.overlay,
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
      fontSize: theme.fontSizeCallout,
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
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: theme.onAccent,
    },
    secondaryButton: {
      height: 52,
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.card,
    },
    secondaryButtonText: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    disabled: { opacity: 0.6 },
    error: {
      fontSize: theme.fontSizeSubhead,
      color: theme.markColor,
      textAlign: 'center',
    },
  });
