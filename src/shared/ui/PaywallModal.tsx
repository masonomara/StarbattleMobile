import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Text } from './Text';
import X from 'lucide-react-native/dist/cjs/icons/x';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useTheme } from '../theme/useTheme';
import { rgba } from '../theme/color';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useProductPrice } from '../hooks/useProductPrice';
import { purchasePremium, purchasePack, PREMIUM_PRODUCT_ID } from '../lib/payments';
import { track } from '../lib/telemetry';
import { PRIVACY_POLICY_URL, TERMS_URL } from '../lib/config';
import type { Theme, PaywallModalProps } from '../../types';

// NOTE: `renderContent()` is a plain function call inside JSX, not a React
// component. For the current scale this is fine; if PaywallModal grows, make
// each context variant its own component so they can own their own hooks and
// memoisation boundaries.
//
// NOTE: The sheet background uses `theme.textSecondary` (see styles.sheet below).
// This is semantically incorrect — textSecondary is a text color token, not a
// surface color. A dedicated `sheetBackground` or `surfaceElevated` token in
// Theme would make the intent clearer and prevent future palette authors from
// accidentally choosing a textSecondary that doesn't work as a surface color.
export function PaywallModal({
  context,
  onClose,
  onPurchaseSuccess,
}: PaywallModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = createStyles(theme);
  const isAnonymous = useAuthStore(s => s.isAnonymous);
  const { loading, error, run } = useAsyncAction();

  const premiumPrice = useProductPrice(PREMIUM_PRODUCT_ID);
  const packPrice = useProductPrice(
    context?.type === 'paid-pack' ? `starbattle_pack_${context.packId}` : '',
  );

  // Funnel: top-of-funnel — record that a paywall was surfaced. `context` is a
  // stable state object while open and a fresh object on each open, so this fires
  // once per open (and once with null on close, which we ignore).
  useEffect(() => {
    if (!context) return;
    track('paywall_shown', {
      meta: { context: context.type, pack: context.packId },
    });
  }, [context]);

  if (!context) return null;

  function purchase(fn: () => Promise<unknown>) {
    run(fn, () => { onPurchaseSuccess?.(); onClose(); });
  }

  const renderContent = () => {
    if (context.type === 'sequential') {
      return (
        <>
          <Text role="headline" style={styles.title}>{t('paywall.lockedTitle')}</Text>
          <Text role="body" style={styles.body}>
            {t('paywall.lockedBody')}
          </Text>
          <Pressable
            style={[styles.primaryButton, loading && styles.disabled]}
            onPress={() => purchase(() => purchasePremium('paywall'))}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <Text role="headline" style={styles.primaryButtonText}>
                {premiumPrice
                  ? t('paywall.unlockAllPrice', { price: premiumPrice })
                  : t('paywall.unlockAll')}
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
            <Text role="headline" style={styles.title}>{context.packName}</Text>
            <Text role="body" style={styles.body}>
              {packPrice
                ? t('paywall.createAccountToBuy', { price: packPrice })
                : t('paywall.createAccountToBuyNoPrice')}
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                onClose();
                useSettingsStore.getState().openSettings();
              }}
            >
              <Text role="headline" style={styles.primaryButtonText}>{t('paywall.createAccount')}</Text>
            </Pressable>
          </>
        );
      }

      return (
        <>
          <Text role="headline" style={styles.title}>{context.packName}</Text>
          <Pressable
            style={[styles.primaryButton, loading && styles.disabled]}
            onPress={() =>
              purchase(() => purchasePack(context.packId, context.storagePath))
            }
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <Text role="headline" style={styles.primaryButtonText}>
                {packPrice
                  ? t('paywall.buyPackPrice', { price: packPrice })
                  : t('paywall.buyPack')}
              </Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, loading && styles.disabled]}
            onPress={() => purchase(() => purchasePremium('paywall'))}
            disabled={loading}
          >
            <Text role="subhead" style={styles.secondaryButtonText}>
              {premiumPrice
                ? t('paywall.buyPremiumAllPacksPrice', { price: premiumPrice })
                : t('paywall.buyPremiumAllPacks')}
            </Text>
          </Pressable>
        </>
      );
    }

    if (context.type === 'unavailable') {
      return (
        <>
          <Text role="headline" style={styles.title}>{context.packName}</Text>
          <Text role="body" style={styles.body}>
            {t('paywall.unavailableBody')}
          </Text>
          <Pressable style={styles.primaryButton} onPress={onClose}>
            <Text role="headline" style={styles.primaryButtonText}>{t('paywall.gotIt')}</Text>
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
      <View testID="paywall-sheet" style={styles.sheet}>
        <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
          <X size={20} color={theme.textSecondary} />
        </Pressable>
        {renderContent()}
        {error && <Text role="subhead" style={styles.error}>{error}</Text>}
        <View style={styles.disclosureLinks}>
          <Pressable onPress={() => Linking.openURL(TERMS_URL).catch(() => {})} hitSlop={8}>
            <Text role="footnote" style={styles.disclosureLink}>{t('paywall.terms')}</Text>
          </Pressable>
          <Text role="footnote" style={styles.disclosureSep}>·</Text>
          <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})} hitSlop={8}>
            <Text role="footnote" style={styles.disclosureLink}>{t('paywall.privacy')}</Text>
          </Pressable>
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
      backgroundColor: rgba(theme.text, 0.4),
    },
    sheet: {
      // textSecondary doubles as the modal sheet surface color in all palettes.
      backgroundColor: theme.textSecondary,
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
      color: theme.text,
      marginBottom: 4,
    },
    body: {
      color: theme.textSecondary,
      marginBottom: theme.spacingMd,
    },
    primaryButton: {
      height: 52,
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.blue,
    },
    primaryButtonText: {
      color: theme.background,
    },
    secondaryButton: {
      height: 52,
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.textSecondary,
    },
    secondaryButtonText: {
      color: theme.text,
    },
    disabled: { opacity: 0.6 },
    error: {
      color: theme.red,
      textAlign: 'center',
    },
    disclosureLinks: {
      marginTop: theme.spacingMd,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
    },
    disclosureLink: {
      color: theme.textSecondary,
    },
    disclosureSep: {
      color: theme.textSecondary,
    },
  });
