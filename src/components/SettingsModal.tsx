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
} from 'react-native';
import { Text } from './Text';
import { X } from 'lucide-react-native';
import Svg, { Rect, Line, Path } from 'react-native-svg';
import { Header } from './Header';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { useTheme } from '../hooks/useTheme';
import { useEntitlements } from '../hooks/useEntitlements';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { purchasePremium, restorePurchases } from '../utils/payments';
import { useProductPrice } from '../hooks/useProductPrice';
import { PALETTES, PALETTE_META, PALETTE_NAMES } from '../themes/palettes';
import { PRIVACY_POLICY_URL } from '../config';
import type { Theme, UserSettings } from '../types';

type EmailMode = 'signup' | 'signin' | null;

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
      <Rect x={0} y={0} width={S} height={S} fill={paletteTheme.bg} />
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
                ? paletteTheme.regionColors[regionIdx]
                : paletteTheme.bg
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
            stroke={paletteTheme.textSecondary}
            strokeWidth={0.5}
          />
          <Line
            x1={bw + i * cs}
            y1={bw}
            x2={bw + i * cs}
            y2={S - bw}
            stroke={paletteTheme.textSecondary}
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
          stroke={paletteTheme.text}
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
          stroke={paletteTheme.text}
          strokeWidth={1.5}
        />
      ))}
      <Rect
        x={bw / 2}
        y={bw / 2}
        width={S - bw}
        height={S - bw}
        fill="none"
        stroke={paletteTheme.text}
        strokeWidth={bw}
      />
      <Path
        d={starPath(STAR.cx, STAR.cy, cs * 0.33)}
        fill={paletteTheme.text}
      />
      <Line
        x1={MARK1.cx - MR}
        y1={MARK1.cy - MR}
        x2={MARK1.cx + MR}
        y2={MARK1.cy + MR}
        stroke={paletteTheme.markColor}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Line
        x1={MARK1.cx + MR}
        y1={MARK1.cy - MR}
        x2={MARK1.cx - MR}
        y2={MARK1.cy + MR}
        stroke={paletteTheme.markColor}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Line
        x1={MARK2.cx - MR}
        y1={MARK2.cy - MR}
        x2={MARK2.cx + MR}
        y2={MARK2.cy + MR}
        stroke={paletteTheme.markColor}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Line
        x1={MARK2.cx + MR}
        y1={MARK2.cy - MR}
        x2={MARK2.cx - MR}
        y2={MARK2.cy + MR}
        stroke={paletteTheme.markColor}
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
        trackColor={{ false: theme.textSecondary, true: theme.accent }}
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
  const signInWithGoogle = useAuthStore(s => s.signInWithGoogle);
  const signUpWithEmail = useAuthStore(s => s.signUpWithEmail);
  const signInWithEmail = useAuthStore(s => s.signInWithEmail);
  const signOut = useAuthStore(s => s.signOut);
  const deleteAccount = useAuthStore(s => s.deleteAccount);

  const premiumPrice = useProductPrice('sb_premium_599');

  const { entitlements, packCatalog } = useEntitlements();

  const [emailMode, setEmailMode] = useState<EmailMode>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { loading, error, setError, run: withLoading } = useAsyncAction();

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

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account, all puzzle progress, streaks, and purchases. This cannot be undone.',
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
                    {Platform.OS === 'ios' && (
                      <Pressable
                        style={[styles.primaryButton, loading && styles.disabled]}
                        onPress={() => withLoading(signInWithApple)}
                        disabled={loading}
                      >
                        {loading ? (
                          <ActivityIndicator color={theme.bg} />
                        ) : (
                          <Text style={styles.primaryButtonText}>
                            Sign up with Apple
                          </Text>
                        )}
                      </Pressable>
                    )}

                    <Pressable
                      style={[
                        Platform.OS === 'ios' ? styles.secondaryButton : styles.primaryButton,
                        loading && styles.disabled,
                      ]}
                      onPress={() => withLoading(signInWithGoogle)}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color={Platform.OS === 'ios' ? theme.accent : theme.bg} />
                      ) : (
                        <Text style={Platform.OS === 'ios' ? styles.secondaryButtonText : styles.primaryButtonText}>
                          Sign up with Google
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
                        <ActivityIndicator color={theme.bg} />
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
                        <ActivityIndicator color={theme.bg} />
                      ) : (
                        <Text style={styles.primaryButtonText}>
                          {premiumPrice ? `Buy Premium · ${premiumPrice}` : 'Buy Premium'}
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
                <Pressable
                  style={[styles.destructiveButton, loading && styles.disabled]}
                  onPress={confirmDeleteAccount}
                  disabled={loading}
                >
                  <Text style={styles.destructiveButtonText}>Delete Account</Text>
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
              <View style={styles.paletteRow}>
                <Text style={styles.rowLabel}>Palette</Text>
                <View style={styles.swatchGrid}>
                  {PALETTE_NAMES.map(name => {
                    const active = settings.palette === name;
                    const paletteTheme =
                      PALETTES[name][theme.isDark ? 'dark' : 'light'];
                    return (
                      <Pressable
                        key={name}
                        onPress={() => updateSettings({ palette: name })}
                        style={[
                          styles.swatchCard,
                          { backgroundColor: paletteTheme.bg },
                          active && { borderColor: paletteTheme.text },
                        ]}
                      >
                        <PalettePreview
                          paletteTheme={paletteTheme}
                          coloredRegions={settings.coloredRegions}
                        />
                        <Text
                          style={[
                            styles.swatchLabel,
                            { color: paletteTheme.textSecondary },
                          ]}
                        >
                          {PALETTE_META[name].label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>

          {/* Legal */}
          <Pressable
            style={styles.privacyLink}
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}
          >
            <Text style={styles.privacyLinkText}>Privacy Policy</Text>
          </Pressable>
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
      backgroundColor: theme.card,
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
      backgroundColor: theme.textSecondary,
    },
    themeButtonTextActive: {
      fontSize: theme.fontSizeSubhead,
      fontWeight: theme.fontWeightSemibold,
      color: theme.bg,
    },
    themeButtonTextInactive: {
      fontSize: theme.fontSizeSubhead,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    paletteRow: {
      paddingVertical: 12,
      paddingHorizontal: 12,
      gap: theme.spacingMd,
    },
    swatchGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
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
      color: theme.bg,
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
      color: theme.bg,
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
    destructiveButton: {
      height: 52,
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.card,
    },
    destructiveButtonText: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: theme.markColor, // TODO: replace with theme.error once that token exists
    },
    privacyLink: {
      alignItems: 'center',
      paddingVertical: theme.spacingLg,
    },
    privacyLinkText: {
      fontSize: theme.fontSizeSubhead,
      color: theme.textSecondary,
    },
    disabled: { opacity: 0.6 },
    error: {
      fontSize: theme.fontSizeSubhead,
      color: theme.markColor,
      textAlign: 'center',
    },
  });
