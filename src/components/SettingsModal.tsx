import React, { useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { Text } from './Text';
import { X } from 'lucide-react-native';
import Svg, { Rect, Line, Path } from 'react-native-svg';
import { Header } from './Header';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { usePuzzleStore } from '../store';
import { useTheme } from '../hooks/useTheme';
import { rgba } from '../themes/ansi';
import { useEntitlements } from '../hooks/useEntitlements';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { purchasePremium, restorePurchases } from '../utils/payments';
import { useProductPrice } from '../hooks/useProductPrice';
import { PALETTES, PALETTE_META, PALETTE_NAMES } from '../themes/palettes';
import { buildTheme } from '../hooks/useTheme';
import { PRIVACY_POLICY_URL, TERMS_URL } from '../config';
import type { Theme, UserSettings } from '../types';

type EmailMode =
  | 'signup'
  | 'signin'
  | 'confirm-email'
  | 'forgot-password'
  | 'reset-sent'
  | null;

const PREVIEW_GRID = [
  [0, 0, 1, 1],
  [0, 2, 2, 1],
  [3, 2, 2, 1],
  [3, 3, 3, 1],
] as const;

const S = 80;
const N = 4;
const bw = 1.5;
const cs = (S - bw * 2) / N;

type Seg = { x1: number; y1: number; x2: number; y2: number };
const THICK_H: Seg[] = [];
const THICK_V: Seg[] = [];
for (let r = 0; r < N; r++) {
  for (let c = 0; c < N; c++) {
    if (r < N - 1 && PREVIEW_GRID[r][c] !== PREVIEW_GRID[r + 1][c]) {
      const y = bw + (r + 1) * cs;
      THICK_H.push({ x1: bw + c * cs, y1: y, x2: bw + (c + 1) * cs, y2: y });
    }
    if (c < N - 1 && PREVIEW_GRID[r][c] !== PREVIEW_GRID[r][c + 1]) {
      const x = bw + (c + 1) * cs;
      THICK_V.push({ x1: x, y1: bw + r * cs, x2: x, y2: bw + (r + 1) * cs });
    }
  }
}

function starPath(cx: number, cy: number, r: number): string {
  const ir = r * 0.38;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : ir;
    pts.push(
      `${i === 0 ? 'M' : 'L'}${(cx + rad * Math.cos(a)).toFixed(2)},${(
        cy +
        rad * Math.sin(a)
      ).toFixed(2)}`,
    );
  }
  return pts.join(' ') + 'Z';
}

const STAR = { cx: bw + 2.5 * cs, cy: bw + 0.5 * cs };
const MARK1 = { cx: bw + 3.5 * cs, cy: bw + 1.5 * cs };
const MARK2 = { cx: bw + 0.5 * cs, cy: bw + 3.5 * cs };
const MR = cs * 0.24;

function PalettePreview({
  paletteTheme,
  coloredRegions,
}: {
  paletteTheme: Theme;
  coloredRegions: boolean;
}) {
  return (
    <Svg width={S} height={S}>
      <Rect
        x={0}
        y={0}
        width={S}
        height={S}
        fill={rgba(
          paletteTheme.isDark ? paletteTheme.black : paletteTheme.white,
          1,
        )}
      />
      {PREVIEW_GRID.map((row, r) =>
        row.map((regionIdx, c) => (
          <Rect
            key={`${r}-${c}`}
            x={bw + c * cs}
            y={bw + r * cs}
            width={cs}
            height={cs}
            fill={
              coloredRegions
                ? rgba(
                    paletteTheme.regionColors[regionIdx],
                    paletteTheme.regionColorAlpha,
                  )
                : rgba(
                    paletteTheme.isDark
                      ? paletteTheme.black
                      : paletteTheme.white,
                    1,
                  )
            }
          />
        )),
      )}
      {[1, 2, 3].map(i => (
        <React.Fragment key={i}>
          <Line
            x1={bw}
            y1={bw + i * cs}
            x2={S - bw}
            y2={bw + i * cs}
            stroke={rgba(
              paletteTheme.isDark ? paletteTheme.lightGray : paletteTheme.gray,
              1,
            )}
            strokeWidth={0.5}
          />
          <Line
            x1={bw + i * cs}
            y1={bw}
            x2={bw + i * cs}
            y2={S - bw}
            stroke={rgba(
              paletteTheme.isDark ? paletteTheme.lightGray : paletteTheme.gray,
              1,
            )}
            strokeWidth={0.5}
          />
        </React.Fragment>
      ))}
      {THICK_H.map((l, i) => (
        <Line
          key={`th${i}`}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke={rgba(
            paletteTheme.isDark ? paletteTheme.white : paletteTheme.black,
            1,
          )}
          strokeWidth={1.5}
        />
      ))}
      {THICK_V.map((l, i) => (
        <Line
          key={`tv${i}`}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke={rgba(
            paletteTheme.isDark ? paletteTheme.white : paletteTheme.black,
            1,
          )}
          strokeWidth={1.5}
        />
      ))}
      <Rect
        x={bw / 2}
        y={bw / 2}
        width={S - bw}
        height={S - bw}
        fill="none"
        stroke={rgba(
          paletteTheme.isDark ? paletteTheme.white : paletteTheme.black,
          1,
        )}
        strokeWidth={bw}
      />
      <Path
        d={starPath(STAR.cx, STAR.cy, cs * 0.33)}
        fill={rgba(
          paletteTheme.isDark ? paletteTheme.white : paletteTheme.black,
          1,
        )}
      />
      <Line
        x1={MARK1.cx - MR}
        y1={MARK1.cy - MR}
        x2={MARK1.cx + MR}
        y2={MARK1.cy + MR}
        stroke={rgba(paletteTheme.red, 1)}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Line
        x1={MARK1.cx + MR}
        y1={MARK1.cy - MR}
        x2={MARK1.cx - MR}
        y2={MARK1.cy + MR}
        stroke={rgba(paletteTheme.red, 1)}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Line
        x1={MARK2.cx - MR}
        y1={MARK2.cy - MR}
        x2={MARK2.cx + MR}
        y2={MARK2.cy + MR}
        stroke={rgba(paletteTheme.red, 1)}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Line
        x1={MARK2.cx + MR}
        y1={MARK2.cy - MR}
        x2={MARK2.cx - MR}
        y2={MARK2.cy + MR}
        stroke={rgba(paletteTheme.red, 1)}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

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
        trackColor={{
          false: rgba(theme.isDark ? theme.lightGray : theme.gray, 1),
          true: rgba(theme.blue, 1),
        }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

// Visibility is driven by Zustand so any screen can open this modal without prop drilling.
export function SettingsModal() {
  const theme = useTheme();
  const systemScheme = useColorScheme();
  const styles = createStyles(theme);
  const settingsModalVisible = useSettingsStore(s => s.settingsModalVisible);
  const closeSettings = useSettingsStore(s => s.closeSettings);
  const settings = useSettingsStore(s => s.settings);
  const updateSettings = useSettingsStore(s => s.updateSettings);
  const recomputeAutoMarks = usePuzzleStore(s => s.recomputeAutoMarks);

  const isAnonymous = useAuthStore(s => s.isAnonymous);
  const user = useAuthStore(s => s.user);
  const signInWithApple = useAuthStore(s => s.signInWithApple);
  const signInWithGoogle = useAuthStore(s => s.signInWithGoogle);
  const signUpWithEmail = useAuthStore(s => s.signUpWithEmail);
  const signInWithEmail = useAuthStore(s => s.signInWithEmail);
  const requestPasswordReset = useAuthStore(s => s.requestPasswordReset);
  const signOut = useAuthStore(s => s.signOut);
  const deleteAccount = useAuthStore(s => s.deleteAccount);

  const premiumPrice = useProductPrice('sb_premium_599');

  const { entitlements, packCatalog } = useEntitlements();

  const [emailMode, setEmailMode] = useState<EmailMode>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { loading, error, setError, run: withLoading } = useAsyncAction();

  async function handleForgotPassword() {
    if (!email) {
      setError('Enter your email address first');
      return;
    }
    await withLoading(async () => {
      await requestPasswordReset(email);
      setEmailMode('reset-sent');
    });
  }

  function warnProgressReplacement(onConfirm: () => void) {
    Alert.alert(
      'Replace Anonymous Progress?',
      'Signing into an existing account will replace your current anonymous progress. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: onConfirm },
      ],
    );
  }

  async function handleEmailSubmit() {
    if (!email || !password) {
      setError('Enter email and password');
      return;
    }
    if (emailMode === 'signup' && password.length < 6) {
      setError('Password must be at least 6 characters');
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
    warnProgressReplacement(() =>
      withLoading(async () => {
        await signInWithEmail(email, password);
        setEmailMode(null);
        setEmail('');
        setPassword('');
      }),
    );
  }

  const ownedPacks = packCatalog.filter(p =>
    entitlements.ownedPackIds.includes(p.id),
  );

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account and all game data (progress, streaks, and entitlements). App Store purchase receipts are managed by Apple and remain in your purchase history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => withLoading(deleteAccount),
        },
      ],
    );
  }

  const isCurrentlyDark =
    settings.theme === 'dark' ? true
    : settings.theme === 'light' ? false
    : systemScheme === 'dark';
  const currentPalette = isCurrentlyDark ? settings.darkPalette : settings.lightPalette;
  const visiblePalettes = PALETTE_NAMES.filter(
    name => buildTheme(PALETTES[name]).isDark === isCurrentlyDark
  );
  const paletteRows: (typeof PALETTE_NAMES[number])[][] = [];
  for (let i = 0; i < visiblePalettes.length; i += 3) {
    paletteRows.push(visiblePalettes.slice(i, i + 3));
  }

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
              <X
                size={24}
                color={rgba(theme.isDark ? theme.white : theme.black, 1)}
              />
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
                    {Platform.OS === 'ios' && (
                      <Pressable
                        style={[
                          styles.primaryButton,
                          loading && styles.disabled,
                        ]}
                        onPress={() =>
                          warnProgressReplacement(() =>
                            withLoading(signInWithApple),
                          )
                        }
                        disabled={loading}
                      >
                        {loading ? (
                          <ActivityIndicator
                            color={rgba(
                              theme.isDark ? theme.black : theme.white,
                              1,
                            )}
                          />
                        ) : (
                          <Text style={styles.primaryButtonText}>
                            Continue with Apple
                          </Text>
                        )}
                      </Pressable>
                    )}

                    <Pressable
                      style={[
                        Platform.OS === 'ios'
                          ? styles.secondaryButton
                          : styles.primaryButton,
                        loading && styles.disabled,
                      ]}
                      onPress={() =>
                        warnProgressReplacement(() =>
                          withLoading(signInWithGoogle),
                        )
                      }
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator
                          color={
                            Platform.OS === 'ios'
                              ? rgba(theme.blue, 1)
                              : rgba(
                                  theme.isDark ? theme.black : theme.white,
                                  1,
                                )
                          }
                        />
                      ) : (
                        <Text
                          style={
                            Platform.OS === 'ios'
                              ? styles.secondaryButtonText
                              : styles.primaryButtonText
                          }
                        >
                          Continue with Google
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
                      <Text style={styles.linkText}>Sign in with Email</Text>
                    </Pressable>
                  </>
                )}

                {(emailMode === 'signup' || emailMode === 'signin') && (
                  <View>
                    <Text style={styles.formTitle}>
                      {emailMode === 'signup' ? 'Create Account' : 'Sign In'}
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Email"
                      placeholderTextColor={rgba(
                        theme.isDark ? theme.lightGray : theme.gray,
                        1,
                      )}
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Password"
                      placeholderTextColor={rgba(
                        theme.isDark ? theme.lightGray : theme.gray,
                        1,
                      )}
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
                        At least 6 characters
                      </Text>
                    )}
                    <Pressable
                      style={[styles.primaryButton, loading && styles.disabled]}
                      onPress={handleEmailSubmit}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator
                          color={rgba(
                            theme.isDark ? theme.black : theme.white,
                            1,
                          )}
                        />
                      ) : (
                        <Text style={styles.primaryButtonText}>
                          {emailMode === 'signup'
                            ? 'Create Account'
                            : 'Sign In'}
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
                        <Text style={styles.linkText}>Forgot Password?</Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={styles.linkButton}
                      onPress={() => {
                        setEmailMode(null);
                        setError(null);
                      }}
                    >
                      <Text style={styles.linkText}>Cancel</Text>
                    </Pressable>
                  </View>
                )}

                {emailMode === 'forgot-password' && (
                  <View>
                    <Text style={styles.formTitle}>Reset Password</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Email"
                      placeholderTextColor={rgba(
                        theme.isDark ? theme.lightGray : theme.gray,
                        1,
                      )}
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
                        <ActivityIndicator
                          color={rgba(
                            theme.isDark ? theme.black : theme.white,
                            1,
                          )}
                        />
                      ) : (
                        <Text style={styles.primaryButtonText}>
                          Send Reset Link
                        </Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={styles.linkButton}
                      onPress={() => {
                        setEmailMode('signin');
                        setError(null);
                      }}
                    >
                      <Text style={styles.linkText}>Back to Sign In</Text>
                    </Pressable>
                  </View>
                )}

                {emailMode === 'reset-sent' && (
                  <View style={styles.confirmEmailBox}>
                    <Text style={styles.confirmEmailTitle}>
                      Check your inbox
                    </Text>
                    <Text style={styles.confirmEmailBody}>
                      We sent a password reset link to{' '}
                      <Text style={styles.confirmEmailAddress}>{email}</Text>.
                    </Text>
                    <Pressable
                      style={styles.primaryButton}
                      onPress={() => {
                        setEmailMode(null);
                        setEmail('');
                        setError(null);
                      }}
                    >
                      <Text style={styles.primaryButtonText}>Done</Text>
                    </Pressable>
                  </View>
                )}

                {emailMode === 'confirm-email' && (
                  <View style={styles.confirmEmailBox}>
                    <Text style={styles.confirmEmailTitle}>
                      Check your inbox
                    </Text>
                    <Text style={styles.confirmEmailBody}>
                      We sent a confirmation link to{' '}
                      <Text style={styles.confirmEmailAddress}>{email}</Text>.
                      Open it to finish creating your account.
                    </Text>
                    <Pressable
                      style={styles.primaryButton}
                      onPress={() => {
                        setEmailMode(null);
                        setEmail('');
                        setError(null);
                      }}
                    >
                      <Text style={styles.primaryButtonText}>Done</Text>
                    </Pressable>
                  </View>
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
                          'Purchases Restored',
                          wasPremium
                            ? 'Your premium access has been restored.'
                            : 'No previous purchases were found on this account.',
                        ),
                    );
                  }}
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
                <Pressable
                  style={[styles.destructiveButton, loading && styles.disabled]}
                  onPress={confirmDeleteAccount}
                  disabled={loading}
                >
                  <Text style={styles.destructiveButtonText}>
                    Delete Account
                  </Text>
                </Pressable>

                {error && <Text style={styles.error}>{error}</Text>}
              </>
            )}
          </View>

          {/* Subscription */}
          {!isAnonymous && (
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
                    <ActivityIndicator
                      color={rgba(theme.isDark ? theme.black : theme.white, 1)}
                    />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {premiumPrice
                        ? `Buy Premium · ${premiumPrice}`
                        : 'Buy Premium'}
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
          )}

          {/* Gameplay */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Gameplay</Text>
            <View style={styles.menuWrapper}>
              <ToggleRow
                label="Auto-X Neighbors"
                value={settings.autoXNeighbors}
                onToggle={v => {
                  updateSettings({ autoXNeighbors: v });
                  recomputeAutoMarks();
                }}
                styles={styles}
                theme={theme}
              />
              <ToggleRow
                label="Auto-X Rows & Columns"
                value={settings.autoXRowsCols}
                onToggle={v => {
                  updateSettings({ autoXRowsCols: v });
                  recomputeAutoMarks();
                }}
                styles={styles}
                theme={theme}
              />
              <ToggleRow
                label="Auto-X Regions"
                value={settings.autoXRegions}
                onToggle={v => {
                  updateSettings({ autoXRegions: v });
                  recomputeAutoMarks();
                }}
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
              <View style={styles.paletteRow}>
                <Text style={styles.rowLabel}>Palette</Text>
                <View style={styles.swatchGrid}>
                  {paletteRows.map((row, rowIdx) => (
                    <View key={rowIdx} style={styles.swatchRow}>
                      {row.map(name => {
                        const active = currentPalette === name;
                        const paletteTheme = buildTheme(PALETTES[name]);
                        return (
                          <Pressable
                            key={name}
                            onPress={() => updateSettings(
                              isCurrentlyDark ? { darkPalette: name } : { lightPalette: name }
                            )}
                            style={[
                              styles.swatchCard,
                              {
                                backgroundColor: rgba(
                                  paletteTheme.isDark
                                    ? paletteTheme.black
                                    : paletteTheme.white,
                                  1,
                                ),
                              },
                              active && {
                                borderColor: rgba(
                                  paletteTheme.isDark
                                    ? paletteTheme.white
                                    : paletteTheme.black,
                                  1,
                                ),
                              },
                            ]}
                          >
                            <PalettePreview
                              paletteTheme={paletteTheme}
                              coloredRegions={settings.coloredRegions}
                            />
                            <Text
                              style={[
                                styles.swatchLabel,
                                {
                                  color: rgba(
                                    paletteTheme.isDark
                                      ? paletteTheme.gray
                                      : paletteTheme.gray,
                                    1,
                                  ),
                                },
                              ]}
                            >
                              {PALETTE_META[name].label}
                            </Text>
                          </Pressable>
                        );
                      })}
                      {row.length < 3 &&
                        Array.from({ length: 3 - row.length }).map((_, j) => (
                          <View key={j} style={styles.swatchCard} />
                        ))}
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>

          {/* Legal */}
          <View style={styles.legalLinks}>
            <Pressable
              onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
              hitSlop={8}
            >
              <Text style={styles.privacyLinkText}>Terms of Use</Text>
            </Pressable>
            <Text style={styles.legalSep}>·</Text>
            <Pressable
              onPress={() =>
                Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})
              }
              hitSlop={8}
            >
              <Text style={styles.privacyLinkText}>Privacy Policy</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => {
  const bg = theme.isDark ? theme.black : theme.white;
  const card = theme.isDark ? theme.gray : theme.white;
  const fg = theme.isDark ? theme.white : theme.black;
  const dim = theme.isDark ? theme.gray : theme.gray;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: rgba(card, 1),
    },
    title: {
      fontSize: theme.fontSizeBody,
      fontWeight: theme.fontWeightSemibold,
      color: rgba(fg, 1),
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: theme.spacingXl,
      gap: theme.spacingXl,
    },
    section: {
      gap: theme.spacingMd,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: theme.fontWeightSemibold,
      color: rgba(dim, 1),
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sectionBody: {
      fontSize: theme.fontSizeCallout,
      color: rgba(dim, 1),
      lineHeight: 22,
    },
    menuWrapper: {
      backgroundColor: rgba(card, 1),
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
      color: rgba(fg, 1),
    },
    themeButtons: {
      flexDirection: 'row',
      gap: theme.spacingMd,
    },
    themeButtonActive: {
      paddingHorizontal: theme.spacingLg,
      paddingVertical: theme.spacingMd,
      borderRadius: theme.radiusMd,
      backgroundColor: rgba(theme.blue, 1),
    },
    themeButtonInactive: {
      paddingHorizontal: theme.spacingLg,
      paddingVertical: theme.spacingMd,
      borderRadius: theme.radiusMd,
      backgroundColor: rgba(dim, 1),
    },
    themeButtonTextActive: {
      fontSize: theme.fontSizeSubhead,
      fontWeight: theme.fontWeightSemibold,
      color: rgba(bg, 1),
    },
    themeButtonTextInactive: {
      fontSize: theme.fontSizeSubhead,
      fontWeight: theme.fontWeightSemibold,
      color: rgba(fg, 1),
    },
    paletteRow: {
      paddingVertical: 12,
      paddingHorizontal: 12,
      gap: theme.spacingMd,
    },
    swatchGrid: {
      gap: 8,
    },
    swatchRow: {
      flexDirection: 'row',
      gap: 8,
    },
    swatchCard: {
      flex: 1,
      borderRadius: theme.radiusMd,
      borderWidth: 2,
      borderColor: 'transparent',
      overflow: 'hidden',
      alignItems: 'center',
      padding: 8,
    },
    swatchLabel: {
      fontSize: 12,
      fontWeight: theme.fontWeightSemibold,
      paddingVertical: 6,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: theme.spacingMd,
      paddingHorizontal: theme.spacingLg,
      borderRadius: theme.radiusMd,
      backgroundColor: rgba(card, 1),
    },
    infoLabel: {
      fontSize: theme.fontSizeCallout,
      color: rgba(dim, 1),
    },
    infoValue: {
      fontSize: theme.fontSizeCallout,
      color: rgba(fg, 1),
      fontWeight: theme.fontWeightSemibold,
      maxWidth: '60%',
      textAlign: 'right',
    },
    premiumBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: theme.spacingLg,
      paddingVertical: theme.spacingMd,
      borderRadius: theme.radiusMd,
      backgroundColor: rgba(theme.blue, 1),
    },
    premiumBadgeText: {
      fontSize: theme.fontSizeSubhead,
      fontWeight: theme.fontWeightSemibold,
      color: rgba(bg, 1),
    },
    subLabel: {
      fontSize: theme.fontSizeSubhead,
      fontWeight: theme.fontWeightSemibold,
      color: rgba(dim, 1),
    },
    ownedPackName: {
      fontSize: theme.fontSizeCallout,
      color: rgba(fg, 1),
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
      color: rgba(bg, 1),
    },
    secondaryButton: {
      height: 52,
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: rgba(card, 1),
    },
    secondaryButtonText: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: rgba(fg, 1),
    },
    linkButton: {
      alignItems: 'center',
      paddingVertical: theme.spacingMd,
    },
    linkText: {
      fontSize: theme.fontSizeSubhead,
      color: rgba(theme.blue, 1),
    },
    formTitle: {
      fontSize: theme.fontSizeBody,
      fontWeight: theme.fontWeightSemibold,
      color: rgba(fg, 1),
    },
    input: {
      height: 52,
      borderRadius: theme.radiusMd,
      paddingHorizontal: theme.spacingLg,
      backgroundColor: rgba(card, 1),
      color: rgba(fg, 1),
      fontSize: theme.fontSizeCallout,
    },
    destructiveButton: {
      height: 52,
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: rgba(card, 1),
    },
    destructiveButtonText: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: rgba(theme.red, 1),
    },
    legalLinks: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: theme.spacingLg,
      gap: 6,
    },
    privacyLinkText: {
      fontSize: theme.fontSizeSubhead,
      color: rgba(dim, 1),
      textDecorationLine: 'underline',
    },
    legalSep: {
      fontSize: theme.fontSizeSubhead,
      color: rgba(dim, 1),
    },
    confirmEmailBox: {
      gap: theme.spacingMd,
    },
    confirmEmailTitle: {
      fontSize: theme.fontSizeBody,
      fontWeight: theme.fontWeightSemibold,
      color: rgba(fg, 1),
    },
    confirmEmailBody: {
      fontSize: theme.fontSizeCallout,
      color: rgba(dim, 1),
      lineHeight: 22,
    },
    confirmEmailAddress: {
      fontWeight: theme.fontWeightSemibold,
      color: rgba(fg, 1),
    },
    passwordHint: {
      fontSize: theme.fontSizeSubhead,
      color: rgba(dim, 1),
    },
    passwordHintMet: {
      color: rgba(theme.blue, 1),
    },
    disabled: { opacity: 0.6 },
    error: {
      fontSize: theme.fontSizeSubhead,
      color: rgba(theme.red, 1),
      textAlign: 'center',
    },
  });
};
