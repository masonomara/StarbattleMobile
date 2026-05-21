import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import { useTheme, type Theme } from '../hooks/useTheme';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useEntitlements } from '../hooks/useEntitlements';
import { purchasePremium, restorePurchases } from '../utils/payments';
import type { UserSettings } from '../types/state';
import type { RootStackParamList } from '../types/navigation';

const THEME_OPTIONS: { label: string; value: UserSettings['theme'] }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

type EmailMode = 'signup' | 'signin' | null;

function ToggleRow({
  label,
  value,
  onToggle,
  styles,
  theme,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: theme.innerBorder, true: theme.accent }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

export function AccountScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Account'>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme);

  const isAnonymous = useAuthStore(s => s.isAnonymous);
  const user = useAuthStore(s => s.user);
  const signInWithApple = useAuthStore(s => s.signInWithApple);
  const signUpWithEmail = useAuthStore(s => s.signUpWithEmail);
  const signInWithEmail = useAuthStore(s => s.signInWithEmail);
  const signOut = useAuthStore(s => s.signOut);

  const settings = useSettingsStore(s => s.settings);
  const updateSettings = useSettingsStore(s => s.updateSettings);

  const { entitlements, packCatalog } = useEntitlements();

  const [emailMode, setEmailMode] = useState<EmailMode>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAppleSignIn() {
    setError(null);
    setLoading(true);
    try {
      await signInWithApple();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSubmit() {
    if (!email || !password) {
      setError('Enter email and password');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (emailMode === 'signup') {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      setEmailMode(null);
      setEmail('');
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleBuyPremium() {
    setError(null);
    setLoading(true);
    try {
      await purchasePremium();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Purchase failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRestorePurchases() {
    setError(null);
    setLoading(true);
    try {
      await restorePurchases();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    setError(null);
    setLoading(true);
    try {
      await signOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign out failed');
    } finally {
      setLoading(false);
    }
  }

  const ownedPacks = packCatalog.filter(p =>
    entitlements.ownedPackIds.includes(p.id),
  );

  return (
    <View style={styles.container}>
      <Header
        left={
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={8}
          >
            <ChevronLeft size={26} color={theme.text} />
          </Pressable>
        }
        center={<Text style={styles.headerTitle}>Account</Text>}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 48 + insets.top, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {isAnonymous ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sync Your Progress</Text>
            <Text style={styles.sectionBody}>
              Create an account to keep your progress across devices and unlock
              purchases.
            </Text>

            {emailMode === null && (
              <>
                <Pressable
                  style={[styles.primaryButton, loading && styles.disabled]}
                  onPress={handleAppleSignIn}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={theme.onAccent} />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      Sign up with Apple
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => setEmailMode('signup')}
                >
                  <Text style={styles.secondaryButtonText}>
                    Sign up with Email
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.linkButton}
                  onPress={() => setEmailMode('signin')}
                >
                  <Text style={styles.linkText}>
                    Already have an account? Sign in
                  </Text>
                </Pressable>
              </>
            )}

            {emailMode !== null && (
              <>
                <Text style={styles.formTitle}>
                  {emailMode === 'signup' ? 'Create Account' : 'Sign In'}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={theme.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor={theme.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete={
                    emailMode === 'signup' ? 'new-password' : 'password'
                  }
                />
                <Pressable
                  style={[styles.primaryButton, loading && styles.disabled]}
                  onPress={handleEmailSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={theme.onAccent} />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {emailMode === 'signup' ? 'Create Account' : 'Sign In'}
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  style={styles.linkButton}
                  onPress={() => {
                    setEmailMode(null);
                    setError(null);
                  }}
                >
                  <Text style={styles.linkText}>Cancel</Text>
                </Pressable>
              </>
            )}

            {error && <Text style={styles.error}>{error}</Text>}
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Account</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>
                  {user?.email ?? 'Sign-in with provider'}
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Subscription</Text>
              {entitlements.isPremium ? (
                <View style={styles.premiumBadge}>
                  <Text style={styles.premiumBadgeText}>Premium</Text>
                </View>
              ) : (
                <Pressable
                  style={[styles.primaryButton, loading && styles.disabled]}
                  onPress={handleBuyPremium}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={theme.onAccent} />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      Buy Premium · $5.99
                    </Text>
                  )}
                </Pressable>
              )}

              {ownedPacks.length > 0 && (
                <>
                  <Text style={styles.subLabel}>Owned Packs</Text>
                  {ownedPacks.map(p => (
                    <Text key={p.id} style={styles.ownedPackName}>
                      {p.name}
                    </Text>
                  ))}
                </>
              )}
            </View>

            <View style={styles.section}>
              <Pressable
                style={[styles.secondaryButton, loading && styles.disabled]}
                onPress={handleRestorePurchases}
                disabled={loading}
              >
                <Text style={styles.secondaryButtonText}>
                  Restore Purchases
                </Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryButton, loading && styles.disabled]}
                onPress={handleSignOut}
                disabled={loading}
              >
                <Text style={styles.secondaryButtonText}>Sign Out</Text>
              </Pressable>
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          </>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gameplay</Text>
          <View style={styles.menuWrapper}>
            <ToggleRow
              label="Auto-X Neighbors"
              value={settings.autoXNeighbors}
              onToggle={v => updateSettings({ autoXNeighbors: v })}
              styles={styles}
              theme={theme}
            />
            <ToggleRow
              label="Auto-X Rows & Columns"
              value={settings.autoXRowsCols}
              onToggle={v => updateSettings({ autoXRowsCols: v })}
              styles={styles}
              theme={theme}
            />
            <ToggleRow
              label="Auto-X Regions"
              value={settings.autoXRegions}
              onToggle={v => updateSettings({ autoXRegions: v })}
              styles={styles}
              theme={theme}
            />
            <ToggleRow
              label="Highlight Errors"
              value={settings.highlightErrors}
              onToggle={v => updateSettings({ highlightErrors: v })}
              styles={styles}
              theme={theme}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>General</Text>
          <View style={styles.menuWrapper}>
            <ToggleRow
              label="Show Timer"
              value={settings.showTimer}
              onToggle={v => updateSettings({ showTimer: v })}
              styles={styles}
              theme={theme}
            />
            <ToggleRow
              label="Hide Toolbar"
              value={settings.hideToolbar}
              onToggle={v => updateSettings({ hideToolbar: v })}
              styles={styles}
              theme={theme}
            />
            <ToggleRow
              label="Haptics"
              value={settings.haptics}
              onToggle={v => updateSettings({ haptics: v })}
              styles={styles}
              theme={theme}
            />
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Theme</Text>
              <View style={styles.themeButtons}>
                {THEME_OPTIONS.map(opt => {
                  const active = settings.theme === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => updateSettings({ theme: opt.value })}
                      style={
                        active
                          ? styles.themeButtonActive
                          : styles.themeButtonInactive
                      }
                    >
                      <Text
                        style={
                          active
                            ? styles.themeButtonTextActive
                            : styles.themeButtonTextInactive
                        }
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.highlight },
    scrollContent: {
      paddingHorizontal: theme.spacingXl,
      gap: theme.spacingXl,
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.card,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 8,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
    },
    section: {
      gap: theme.spacingMd,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: theme.fontWeightSemibold,
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sectionBody: {
      fontSize: theme.fontSizeMd,
      color: theme.textSecondary,
      lineHeight: 22,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: theme.spacingMd,
      paddingHorizontal: theme.spacingLg,
      borderRadius: theme.radiusMd,
      backgroundColor: theme.card,
    },
    infoLabel: {
      fontSize: theme.fontSizeMd,
      color: theme.textSecondary,
    },
    infoValue: {
      fontSize: theme.fontSizeMd,
      color: theme.text,
      fontWeight: theme.fontWeightSemibold,
      maxWidth: '60%',
      textAlign: 'right',
    },
    premiumBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: theme.spacingLg,
      paddingVertical: theme.spacingMd,
      borderRadius: theme.radiusMd,
      backgroundColor: theme.accent,
    },
    premiumBadgeText: {
      fontSize: theme.fontSizeSm,
      fontWeight: theme.fontWeightSemibold,
      color: theme.onAccent,
    },
    subLabel: {
      fontSize: theme.fontSizeSm,
      fontWeight: theme.fontWeightSemibold,
      color: theme.textSecondary,
      marginTop: theme.spacingMd,
    },
    ownedPackName: {
      fontSize: theme.fontSizeMd,
      color: theme.text,
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
      backgroundColor: theme.card,
    },
    secondaryButtonText: {
      fontSize: theme.fontSizeMd,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    linkButton: {
      alignItems: 'center',
      paddingVertical: theme.spacingMd,
    },
    linkText: {
      fontSize: theme.fontSizeSm,
      color: theme.accent,
    },
    formTitle: {
      fontSize: theme.fontSizeLg,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    input: {
      height: 52,
      borderRadius: theme.radiusMd,
      paddingHorizontal: theme.spacingLg,
      backgroundColor: theme.card,
      color: theme.text,
      fontSize: theme.fontSizeMd,
    },
    disabled: { opacity: 0.6 },
    error: {
      fontSize: theme.fontSizeSm,
      color: theme.markColor,
      textAlign: 'center',
    },
    menuWrapper: {
      backgroundColor: theme.card,
      borderRadius: theme.radiusMd,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: 60,
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    rowLabel: {
      fontSize: 15,
      lineHeight: 20,
      color: theme.text,
      fontWeight: '600' as const,
    },
    themeButtons: {
      flexDirection: 'row',
      gap: theme.spacingMd,
    },
    themeButtonActive: {
      paddingHorizontal: theme.spacingLg,
      paddingVertical: theme.spacingMd,
      borderRadius: theme.radiusMd,
      backgroundColor: theme.accent,
    },
    themeButtonInactive: {
      paddingHorizontal: theme.spacingLg,
      paddingVertical: theme.spacingMd,
      borderRadius: theme.radiusMd,
      backgroundColor: theme.innerBorder,
    },
    themeButtonTextActive: {
      fontSize: theme.fontSizeSm,
      fontWeight: theme.fontWeightSemibold,
      color: theme.onAccent,
    },
    themeButtonTextInactive: {
      fontSize: theme.fontSizeSm,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
  });
