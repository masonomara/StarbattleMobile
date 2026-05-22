import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { X } from 'lucide-react-native';
import { Header } from './Header';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { useTheme } from '../hooks/useTheme';
import { useEntitlements } from '../hooks/useEntitlements';
import { purchasePremium, restorePurchases } from '../utils/payments';
import type { Theme } from '../types/theme';
import type { UserSettings } from '../types/state';

type EmailMode = 'signup' | 'signin' | null;

const THEME_OPTIONS: { label: string; value: UserSettings['theme'] }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

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

// Visibility is driven by Zustand so any screen can open this modal without prop drilling.
export function SettingsModal() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const settingsModalVisible = useSettingsStore(s => s.settingsModalVisible);
  const closeSettings = useSettingsStore(s => s.closeSettings);
  const settings = useSettingsStore(s => s.settings);
  const updateSettings = useSettingsStore(s => s.updateSettings);

  const isAnonymous = useAuthStore(s => s.isAnonymous);
  const user = useAuthStore(s => s.user);
  const signInWithApple = useAuthStore(s => s.signInWithApple);
  const signUpWithEmail = useAuthStore(s => s.signUpWithEmail);
  const signInWithEmail = useAuthStore(s => s.signInWithEmail);
  const signOut = useAuthStore(s => s.signOut);

  const { entitlements, packCatalog } = useEntitlements();

  const [emailMode, setEmailMode] = useState<EmailMode>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withLoading(fn: () => Promise<unknown>) {
    setError(null);
    setLoading(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSubmit() {
    if (!email || !password) {
      setError('Enter email and password');
      return;
    }
    await withLoading(async () => {
      if (emailMode === 'signup') {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      setEmailMode(null);
      setEmail('');
      setPassword('');
    });
  }

  const ownedPacks = packCatalog.filter(p =>
    entitlements.ownedPackIds.includes(p.id),
  );

  return (
    <Modal
      visible={settingsModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeSettings}
    >
      <View style={styles.container}>
        <Header
          absolute={false}
          center={<Text style={styles.title}>Star Battle</Text>}
          right={
            <Pressable onPress={closeSettings} hitSlop={8}>
              <X size={24} color={theme.text} />
            </Pressable>
          }
        />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Account */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            {isAnonymous ? (
              <>
                <Text style={styles.sectionBody}>
                  Create an account to keep your progress across devices and
                  unlock purchases.
                </Text>

                {emailMode === null && (
                  <>
                    <Pressable
                      style={[styles.primaryButton, loading && styles.disabled]}
                      onPress={() => withLoading(signInWithApple)}
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
                          {emailMode === 'signup'
                            ? 'Create Account'
                            : 'Sign In'}
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
              </>
            ) : (
              <>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue}>
                    {user?.email ?? 'Sign-in with provider'}
                  </Text>
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
                      onPress={() => withLoading(purchasePremium)}
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

                <Pressable
                  style={[styles.secondaryButton, loading && styles.disabled]}
                  onPress={() => withLoading(restorePurchases)}
                  disabled={loading}
                >
                  <Text style={styles.secondaryButtonText}>
                    Restore Purchases
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryButton, loading && styles.disabled]}
                  onPress={() => withLoading(signOut)}
                  disabled={loading}
                >
                  <Text style={styles.secondaryButtonText}>Sign Out</Text>
                </Pressable>

                {error && <Text style={styles.error}>{error}</Text>}
              </>
            )}
          </View>

          {/* Gameplay */}
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
              <ToggleRow
                label="Colored Regions"
                value={settings.coloredRegions}
                onToggle={v => updateSettings({ coloredRegions: v })}
                styles={styles}
                theme={theme}
              />
            </View>
          </View>

          {/* General */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>General</Text>
            <View style={styles.menuWrapper}>
              <ToggleRow
                label="Always show timer"
                value={settings.alwaysShowTimer}
                onToggle={v => updateSettings({ alwaysShowTimer: v })}
                styles={styles}
                theme={theme}
              />
              <ToggleRow
                label="Always show toolbar"
                value={settings.alwaysShowToolbar}
                onToggle={v => updateSettings({ alwaysShowToolbar: v })}
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
    </Modal>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: theme.spacingXl,
      backgroundColor: theme.highlight,
    },
    title: {
      fontSize: theme.fontSizeBody,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    scrollContent: {
      paddingHorizontal: theme.spacingXl,
      paddingBottom: theme.spacingXl,
      gap: theme.spacingXl,
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
      fontSize: theme.fontSizeCallout,
      color: theme.textSecondary,
      lineHeight: 22,
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
      fontSize: theme.fontSizeSubhead,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
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
      fontSize: theme.fontSizeSubhead,
      fontWeight: theme.fontWeightSemibold,
      color: theme.onAccent,
    },
    themeButtonTextInactive: {
      fontSize: theme.fontSizeSubhead,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
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
      fontSize: theme.fontSizeCallout,
      color: theme.textSecondary,
    },
    infoValue: {
      fontSize: theme.fontSizeCallout,
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
      fontSize: theme.fontSizeSubhead,
      fontWeight: theme.fontWeightSemibold,
      color: theme.onAccent,
    },
    subLabel: {
      fontSize: theme.fontSizeSubhead,
      fontWeight: theme.fontWeightSemibold,
      color: theme.textSecondary,
    },
    ownedPackName: {
      fontSize: theme.fontSizeCallout,
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
    linkButton: {
      alignItems: 'center',
      paddingVertical: theme.spacingMd,
    },
    linkText: {
      fontSize: theme.fontSizeSubhead,
      color: theme.accent,
    },
    formTitle: {
      fontSize: theme.fontSizeBody,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    input: {
      height: 52,
      borderRadius: theme.radiusMd,
      paddingHorizontal: theme.spacingLg,
      backgroundColor: theme.card,
      color: theme.text,
      fontSize: theme.fontSizeCallout,
    },
    disabled: { opacity: 0.6 },
    error: {
      fontSize: theme.fontSizeSubhead,
      color: theme.markColor,
      textAlign: 'center',
    },
  });
