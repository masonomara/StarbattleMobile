import React from 'react';
import { View, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Text } from '../Text';
import { useAuthStore } from '../../stores/authStore';
import { useEntitlements } from '../../hooks/useEntitlements';
import { useProductPrice } from '../../hooks/useProductPrice';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { purchasePremium, restorePurchases, PREMIUM_PRODUCT_ID } from '../../utils/payments';
import { useTheme } from '../../hooks/useTheme';
import type { Theme } from '../../types';

export function SubscriptionSection() {
  const theme = useTheme();
  const styles = createStyles(theme);

  const isAnonymous = useAuthStore(s => s.isAnonymous);
  const { entitlements, packCatalog } = useEntitlements();
  const premiumPrice = useProductPrice(PREMIUM_PRODUCT_ID);
  const { loading, run: withLoading } = useAsyncAction();

  if (isAnonymous) return null;

  const ownedPacks = packCatalog.filter(p => entitlements.ownedPackIds.includes(p.id));

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Subscription</Text>

      {entitlements.isPremium ? (
        <View style={styles.premiumBadge}>
          <Text style={styles.premiumBadgeText}>Premium</Text>
        </View>
      ) : (
        <Pressable
          style={[styles.primaryButton, loading && styles.disabled]}
          onPress={() => withLoading(purchasePremium)}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.background} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {premiumPrice ? `Buy Premium · ${premiumPrice}` : 'Buy Premium'}
            </Text>
          )}
        </Pressable>
      )}

      <Pressable
        style={[styles.secondaryButton, loading && styles.disabled]}
        onPress={() => {
          let wasPremium = false;
          withLoading(
            async () => { wasPremium = await restorePurchases(); },
            () =>
              Alert.alert(
                'Purchases Restored',
                wasPremium
                  ? 'Your premium access has been restored.'
                  : 'No previous purchases were found on this account.',
              ),
          );
        }}
        disabled={loading}
      >
        <Text style={styles.secondaryButtonText}>Restore Purchases</Text>
      </Pressable>

      {ownedPacks.length > 0 && (
        <>
          <Text style={styles.subLabel}>Owned Packs</Text>
          {ownedPacks.map(p => (
            <Text key={p.id} style={styles.ownedPackName}>{p.name}</Text>
          ))}
        </>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    section: { marginTop: 40 },
    sectionTitle: {
      fontSize: 20,
      color: theme.text,
      lineHeight: 22,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: '900',
      marginBottom: 14,
    },
    premiumBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: theme.spacingLg,
      paddingVertical: theme.spacingMd,
      borderRadius: theme.radiusMd,
      backgroundColor: theme.blue,
    },
    premiumBadgeText: {
      fontSize: theme.fontSizeSubhead,
      fontWeight: theme.fontWeightSemibold,
      color: theme.background,
    },
    primaryButton: {
      height: 52,
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.blue,
    },
    primaryButtonText: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: theme.background,
    },
    secondaryButton: {
      height: 52,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: theme.text,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
    },
    secondaryButtonText: { fontSize: 17, fontWeight: '700', color: theme.text },
    subLabel: {
      fontSize: theme.fontSizeSubhead,
      fontWeight: theme.fontWeightSemibold,
      color: theme.textSecondary,
    },
    ownedPackName: { fontSize: theme.fontSizeCallout, color: theme.text },
    disabled: { opacity: 0.6 },
  });
