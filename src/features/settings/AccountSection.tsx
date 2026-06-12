import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import AtSign from 'lucide-react-native/dist/cjs/icons/at-sign';
import Svg, { Path } from 'react-native-svg';
import { Text } from '../../shared/ui/Text';
import { useAuthStore } from '../../shared/stores/authStore';
import { useEntitlements } from '../../shared/hooks/useEntitlements';
import { useProductPrice } from '../../shared/hooks/useProductPrice';
import { useTheme } from '../../shared/theme/useTheme';
import { useAsyncAction } from '../../shared/hooks/useAsyncAction';
import {
  purchasePremium,
  restorePurchases,
  PREMIUM_PRODUCT_ID,
} from '../../shared/lib/payments';
import type { Theme } from '../../types';

type EmailMode =
  | 'signup'
  | 'signin'
  | 'confirm-email'
  | 'forgot-password'
  | 'reset-otp'
  | null;

function GoogleIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
  );
}

function AppleIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
        fill={color}
      />
    </Svg>
  );
}

export function AccountSection() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = createStyles(theme);

  const isAnonymous = useAuthStore(s => s.isAnonymous);
  const user = useAuthStore(s => s.user);
  const signInWithApple = useAuthStore(s => s.signInWithApple);
  const signInWithGoogle = useAuthStore(s => s.signInWithGoogle);
  const signUpWithEmail = useAuthStore(s => s.signUpWithEmail);
  const signInWithEmail = useAuthStore(s => s.signInWithEmail);
  const requestPasswordReset = useAuthStore(s => s.requestPasswordReset);
  const resetPasswordWithOtp = useAuthStore(s => s.resetPasswordWithOtp);
  const signOut = useAuthStore(s => s.signOut);
  const deleteAccount = useAuthStore(s => s.deleteAccount);

  const { entitlements, packCatalog } = useEntitlements();
  const premiumPrice = useProductPrice(PREMIUM_PRODUCT_ID);

  const { loading, error, setError, run: withLoading } = useAsyncAction();

  const [emailMode, setEmailMode] = useState<EmailMode>(null);
  const [authTab, setAuthTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetCode, setResetCode] = useState('');

  async function handleForgotPassword() {
    if (!email) {
      setError(t('account.errEmailFirst'));
      return;
    }
    await withLoading(async () => {
      await requestPasswordReset(email);
      setResetCode('');
      setPassword('');
      setEmailMode('reset-otp');
    });
  }

  async function handleResetPassword() {
    if (resetCode.trim().length !== 6) {
      setError(t('account.errOtp'));
      return;
    }
    if (password.length < 6) {
      setError(t('account.errPasswordLength'));
      return;
    }
    await withLoading(async () => {
      // On success the session flips to the recovered (non-anonymous) account,
      // so this section re-renders into the signed-in view — no success screen
      // needed. Just clear the transient inputs.
      await resetPasswordWithOtp(email, resetCode.trim(), password);
      setEmailMode(null);
      setEmail('');
      setPassword('');
      setResetCode('');
    });
  }

  async function handleEmailSubmit() {
    if (!email || !password) {
      setError(t('account.errEmptyFields'));
      return;
    }
    if (emailMode === 'signup' && password.length < 6) {
      setError(t('account.errPasswordLength'));
      return;
    }
    if (emailMode === 'signup') {
      await withLoading(async () => {
        await signUpWithEmail(email, password);
        setEmailMode('confirm-email');
        setPassword('');
      });
      return;
    }
    await withLoading(async () => {
      await signInWithEmail(email, password);
      setEmailMode(null);
      setEmail('');
      setPassword('');
    });
  }

  function confirmDeleteAccount() {
    Alert.alert(
      t('account.deleteTitle'),
      t('account.deleteBody'),
      [
        { text: t('account.deleteCancel'), style: 'cancel' },
        {
          text: t('account.deleteConfirm'),
          style: 'destructive',
          onPress: () => withLoading(deleteAccount),
        },
      ],
    );
  }

  const ownedPacks = packCatalog.filter(p =>
    entitlements.ownedPackIds.includes(p.id),
  );

  return (
    <View style={styles.section}>
      <Text role="headline" style={styles.sectionTitle}>
        {isAnonymous
          ? authTab === 'signin'
            ? t('account.signInTab')
            : t('account.signUpTab')
          : t('account.accountTab')}
      </Text>

      {isAnonymous ? (
        <>
          {authTab === 'signup' ? (
            <Text role="body" style={styles.sectionBody}>
              {t('account.signUpIntro')}
            </Text>
          ) : (
            <Text role="body" style={styles.sectionBody}>
              {t('account.signInIntro')}
            </Text>
          )}

          {emailMode === null && (
            <View style={{ gap: 12 }}>
              <Pressable
                style={[styles.secondaryButton, loading && styles.disabled]}
                onPress={() => {
                  setError(null);
                  setEmailMode(authTab);
                }}
                disabled={loading}
              >
                <View style={styles.buttonRow}>
                  <AtSign size={18} color={theme.text} />
                  <Text role="subhead" style={styles.secondaryButtonText}>
                    {authTab === 'signin'
                      ? t('account.signInEmail')
                      : t('account.signUpEmail')}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                style={[styles.secondaryButton, loading && styles.disabled]}
                onPress={() => withLoading(signInWithGoogle)}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={theme.text} />
                ) : (
                  <View style={styles.buttonRow}>
                    <GoogleIcon size={18} />
                    <Text role="subhead" style={styles.secondaryButtonText}>
                      {authTab === 'signin'
                        ? t('account.signInGoogle')
                        : t('account.signUpGoogle')}
                    </Text>
                  </View>
                )}
              </Pressable>
              {Platform.OS === 'ios' && (
                <Pressable
                  style={[styles.secondaryButton, loading && styles.disabled]}
                  onPress={() => withLoading(signInWithApple)}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={theme.text} />
                  ) : (
                    <View style={styles.buttonRow}>
                      <AppleIcon size={18} color={theme.text} />
                      <Text role="subhead" style={styles.secondaryButtonText}>
                        {authTab === 'signin'
                          ? t('account.signInApple')
                          : t('account.signUpApple')}
                      </Text>
                    </View>
                  )}
                </Pressable>
              )}
              <Pressable
                style={styles.linkButton}
                onPress={() =>
                  setAuthTab(authTab === 'signin' ? 'signup' : 'signin')
                }
              >
                <Text role="subhead" style={styles.linkText}>
                  {authTab === 'signin'
                    ? t('account.switchToSignUp')
                    : t('account.switchToSignIn')}
                </Text>
              </Pressable>
            </View>
          )}

          {(emailMode === 'signup' || emailMode === 'signin') && (
            <View style={{ gap: 12 }}>
              <Text role="body" style={styles.inputLabel}>{t('account.emailLabel')}</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor={theme.textSecondary}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
              <Text role="body" style={styles.inputLabel}>{t('account.passwordLabel')}</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor={theme.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete={
                  emailMode === 'signup' ? 'new-password' : 'password'
                }
              />
              {emailMode === 'signup' && (
                <Text
                  style={[
                    styles.passwordHint,
                    password.length >= 6 && styles.passwordHintMet,
                  ]}
                >
                  {t('account.passwordHint')}
                </Text>
              )}
              <Pressable
                style={[styles.primaryButton, loading && styles.disabled]}
                onPress={handleEmailSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={theme.background} />
                ) : (
                  <Text role="headline" style={styles.primaryButtonText}>
                    {emailMode === 'signup'
                      ? t('account.submitSignUp')
                      : t('account.submitSignIn')}
                  </Text>
                )}
              </Pressable>
              {emailMode === 'signin' && (
                <Pressable
                  style={styles.linkButton}
                  onPress={() => {
                    setEmailMode('forgot-password');
                    setError(null);
                  }}
                  disabled={loading}
                >
                  <Text role="subhead" style={styles.linkText}>{t('account.forgotPassword')}</Text>
                </Pressable>
              )}
              <Pressable
                style={styles.linkButton}
                onPress={() => {
                  setEmailMode(null);
                  setError(null);
                }}
              >
                <Text role="subhead" style={styles.linkTextDanger}>{t('account.cancel')}</Text>
              </Pressable>
            </View>
          )}

          {emailMode === 'forgot-password' && (
            <View style={{ gap: 12 }}>
              <Text role="body" style={styles.inputLabel}>{t('account.resetTitle')}</Text>
              <Text role="body" style={styles.sectionBody}>
                {t('account.resetHelper')}
              </Text>
              <TextInput
                style={styles.input}
                placeholder={t('account.emailPlaceholder')}
                placeholderTextColor={theme.textSecondary}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
              <Pressable
                style={[styles.primaryButton, loading && styles.disabled]}
                onPress={handleForgotPassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={theme.background} />
                ) : (
                  <Text role="headline" style={styles.primaryButtonText}>{t('account.sendCode')}</Text>
                )}
              </Pressable>
              <Pressable
                style={styles.linkButton}
                onPress={() => {
                  setEmailMode('signin');
                  setError(null);
                }}
              >
                <Text role="subhead" style={styles.linkText}>{t('account.backToSignIn')}</Text>
              </Pressable>
            </View>
          )}

          {emailMode === 'reset-otp' && (
            <View style={{ gap: 12 }}>
              <Text role="body" style={styles.inputLabel}>{t('account.resetTitle')}</Text>
              <Text role="body" style={styles.sectionBody}>
                {t('account.resetOtpInstructions', { email })}
              </Text>
              <TextInput
                style={styles.input}
                placeholder={t('account.otpPlaceholder')}
                placeholderTextColor={theme.textSecondary}
                value={resetCode}
                onChangeText={setResetCode}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                autoFocus
              />
              <TextInput
                style={styles.input}
                placeholder={t('account.newPasswordPlaceholder')}
                placeholderTextColor={theme.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
              />
              <Text
                style={[
                  styles.passwordHint,
                  password.length >= 6 && styles.passwordHintMet,
                ]}
              >
                {t('account.passwordHint')}
              </Text>
              <Pressable
                style={[styles.primaryButton, loading && styles.disabled]}
                onPress={handleResetPassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={theme.background} />
                ) : (
                  <Text role="headline" style={styles.primaryButtonText}>{t('account.resetTitle')}</Text>
                )}
              </Pressable>
              <Pressable
                style={styles.linkButton}
                onPress={() => withLoading(() => requestPasswordReset(email))}
                disabled={loading}
              >
                <Text role="subhead" style={styles.linkText}>{t('account.resendCode')}</Text>
              </Pressable>
              <Pressable
                style={styles.linkButton}
                onPress={() => {
                  setEmailMode('signin');
                  setResetCode('');
                  setPassword('');
                  setError(null);
                }}
              >
                <Text role="subhead" style={styles.linkText}>{t('account.backToSignIn')}</Text>
              </Pressable>
            </View>
          )}

          {emailMode === 'confirm-email' && (
            <View style={styles.confirmEmailBox}>
              <Text role="headline" style={styles.confirmEmailTitle}>{t('account.confirmInboxTitle')}</Text>
              <Text role="body" style={styles.confirmEmailBody}>
                {t('account.confirmInboxBody', { email })}
              </Text>
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  setEmailMode(null);
                  setEmail('');
                  setError(null);
                }}
              >
                <Text role="headline" style={styles.primaryButtonText}>{t('account.done')}</Text>
              </Pressable>
            </View>
          )}

          {error && <Text role="subhead" style={styles.error}>{error}</Text>}
        </>
      ) : (
        <>
          <View style={[styles.infoRow, styles.infoRowFirst]}>
            <Text role="body" style={styles.infoLabel}>{t('account.emailRowLabel')}</Text>
            <Text role="subhead" style={styles.infoValue} numberOfLines={1}>
              {user?.email ?? t('account.providerFallback')}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text role="body" style={styles.infoLabel}>{t('account.accountType')}</Text>
            <Text role="subhead" style={styles.infoValue}>
              {entitlements.isPremium ? t('account.premium') : t('account.free')}
            </Text>
          </View>

          <View style={styles.accountActions}>
            {entitlements.isPremium ? (
              <></>
            ) : (
              <Pressable
                style={[styles.primaryButton, loading && styles.disabled]}
                onPress={() => withLoading(purchasePremium)}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={theme.background} />
                ) : (
                  <Text role="headline" style={styles.primaryButtonText}>
                    {premiumPrice
                      ? t('account.buyPremiumPrice', { price: premiumPrice })
                      : t('account.buyPremium')}
                  </Text>
                )}
              </Pressable>
            )}

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
                      wasPremium
                        ? t('account.restoredFound')
                        : t('account.restoredNone'),
                    ),
                );
              }}
              disabled={loading}
            >
              <Text role="subhead" style={styles.secondaryButtonText}>{t('account.restorePurchases')}</Text>
            </Pressable>

            {ownedPacks.length > 0 && (
              <>
                <Text role="subhead" style={styles.subLabel}>{t('account.ownedPacks')}</Text>
                {ownedPacks.map(p => (
                  <Text key={p.id} role="body" style={styles.ownedPackName}>
                    {p.name}
                  </Text>
                ))}
              </>
            )}

            <Pressable
              style={[styles.secondaryButton, loading && styles.disabled]}
              onPress={() => withLoading(signOut)}
              disabled={loading}
            >
              <Text role="subhead" style={styles.secondaryButtonText}>{t('account.signOut')}</Text>
            </Pressable>
            <Pressable
              style={[styles.destructiveButton, loading && styles.disabled]}
              onPress={confirmDeleteAccount}
              disabled={loading}
            >
              <Text role="subhead" style={styles.destructiveButtonText}>{t('account.deleteAccount')}</Text>
            </Pressable>
          </View>

          {error && <Text role="subhead" style={styles.error}>{error}</Text>}
        </>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    section: { marginTop: 16 },
    sectionTitle: {
      color: theme.text,
      marginBottom: 14,
    },
    sectionBody: {
      color: theme.textSecondary,
      marginTop: -7,
      marginBottom: 14,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: 56,
      borderTopWidth: 1,
      borderColor: theme.border,
    },
    infoRowFirst: {
      borderTopWidth: 0,
    },
    infoLabel: { color: theme.text },
    infoValue: {
      color: theme.textSecondary,
      maxWidth: 240,
      textAlign: 'right',
      overflow: 'hidden',
    },
    primaryButton: {
      height: 52,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: theme.background,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.text,
      marginTop: 8,
    },
    primaryButtonText: {
      color: theme.background,
    },
    secondaryButton: {
      height: 52,
      flex: 1,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
    },
    secondaryButtonText: { color: theme.text },
    accountActions: { gap: 12, marginTop: 14 },
    subLabel: {
      color: theme.textSecondary,
    },
    ownedPackName: { color: theme.text },
    buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    linkButton: {
      height: 52,
      flex: 1,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
      paddingVertical: theme.spacingMd,
    },
    linkText: {
      color: theme.text,
    },
    linkTextDanger: {
      color: theme.red,
    },
    inputLabel: {
      marginBottom: -4,
      color: theme.text,
    },
    input: {
      height: 52,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: theme.border,
      paddingHorizontal: theme.spacingLg,
      backgroundColor: theme.surface,
      color: theme.text,
      fontSize: theme.type.body.fontSize,
      marginBottom: 12,
    },
    destructiveButton: {
      height: 52,
      flex: 1,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
    },
    destructiveButtonText: {
      color: theme.red,
    },
    confirmEmailBox: { gap: theme.spacingMd },
    confirmEmailTitle: {
      color: theme.text,
    },
    confirmEmailBody: {
      color: theme.textSecondary,
    },
    passwordHint: {
      color: theme.textSecondary,
    },
    passwordHintMet: { color: theme.blue },
    disabled: { opacity: 0.6 },
    error: {
      color: theme.red,
      textAlign: 'center',
      marginTop: 18,
    },
  });
