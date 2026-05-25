import {
  View,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Text } from './Text';
import { X } from 'lucide-react-native';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useTheme } from '../hooks/useTheme';
import { rgba } from '../themes/ansi';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useProductPrice } from '../hooks/useProductPrice';
import { purchasePremium, purchasePack } from '../utils/payments';
import { PRIVACY_POLICY_URL, TERMS_URL } from '../config';
import type { Theme, PaywallModalProps } from '../types';

export function PaywallModal({
  context,
  onClose,
  onPurchaseSuccess,
}: PaywallModalProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const isAnonymous = useAuthStore(s => s.isAnonymous);
  const { loading, error, run } = useAsyncAction();

  const premiumPrice = useProductPrice('sb_premium_599');
  const packPrice = useProductPrice(
    context?.type === 'paid-pack' ? `starbattle_pack_${context.packId}` : '',
  );

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
              <ActivityIndicator color={rgba(theme.isDark ? theme.black : theme.white, 1)} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {premiumPrice
                  ? `Unlock All with Premium · ${premiumPrice}`
                  : 'Unlock All with Premium'}
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
              Create an account to purchase this pack
              {packPrice ? ` for ${packPrice}` : ''}.
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
              <ActivityIndicator color={rgba(theme.isDark ? theme.black : theme.white, 1)} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {packPrice ? `Buy Pack · ${packPrice}` : 'Buy Pack'}
              </Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, loading && styles.disabled]}
            onPress={() => purchase(purchasePremium)}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>
              {premiumPrice
                ? `Buy Premium · ${premiumPrice} · All Packs`
                : 'Buy Premium · All Packs'}
            </Text>
          </Pressable>
        </>
      );
    }

    if (context.type === 'unavailable') {
      return (
        <>
          <Text style={styles.title}>{context.packName}</Text>
          <Text style={styles.body}>
            This pack isn't available for purchase right now. Please check back later.
          </Text>
          <Pressable style={styles.primaryButton} onPress={onClose}>
            <Text style={styles.primaryButtonText}>Got it</Text>
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
          <X size={20} color={rgba(theme.isDark ? theme.gray : theme.gray, 1)} />
        </Pressable>
        {renderContent()}
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.disclosureContainer}>
          <View style={styles.disclosureLinks}>
            <Pressable onPress={() => Linking.openURL(TERMS_URL).catch(() => {})} hitSlop={8}>
              <Text style={styles.disclosureLink}>Terms of Use</Text>
            </Pressable>
            <Text style={styles.disclosureSep}>·</Text>
            <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})} hitSlop={8}>
              <Text style={styles.disclosureLink}>Privacy Policy</Text>
            </Pressable>
          </View>
        </View>
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
      backgroundColor: rgba(theme.isDark ? theme.white : theme.black, 0.4),
    },
    sheet: {
      backgroundColor: rgba(theme.isDark ? theme.gray : theme.gray, 1),
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
      color: rgba(theme.isDark ? theme.white : theme.black, 1),
      marginBottom: 4,
    },
    body: {
      fontSize: theme.fontSizeCallout,
      color: rgba(theme.isDark ? theme.gray : theme.gray, 1),
      lineHeight: 22,
      marginBottom: theme.spacingMd,
    },
    primaryButton: {
      height: 52,
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: rgba(theme.blue, 1),
    },
    primaryButtonText: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: rgba(theme.isDark ? theme.black : theme.white, 1),
    },
    secondaryButton: {
      height: 52,
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: rgba(theme.isDark ? theme.gray : theme.gray, 1),
    },
    secondaryButtonText: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: rgba(theme.isDark ? theme.white : theme.black, 1),
    },
    disabled: { opacity: 0.6 },
    error: {
      fontSize: theme.fontSizeSubhead,
      color: rgba(theme.red, 1),
      textAlign: 'center',
    },
    disclosureContainer: {
      marginTop: theme.spacingMd,
    },
    disclosureLinks: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
    },
    disclosureLink: {
      fontSize: 11,
      color: rgba(theme.isDark ? theme.gray : theme.gray, 1),
      textDecorationLine: 'underline',
    },
    disclosureSep: {
      fontSize: 11,
      color: rgba(theme.isDark ? theme.gray : theme.gray, 1),
    },
  });
