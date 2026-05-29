// ARCH: SettingsModal is a God Component (~1400 lines) responsible for:
//   1. Auth flow (sign-in / sign-up / forgot-password / reset-sent / confirm-email)
//   2. Subscription management (premium badge, buy, restore, owned packs list)
//   3. Gameplay settings (toggle rows for auto-X, errors, regions, etc.)
//   4. General settings (timer, toolbar, haptics, theme picker)
//   5. Color palette selection with live preview (PalettePreview, SVG mini-grid)
//   6. Legal sub-views (Terms WebView, Privacy WebView, Acknowledgements scroll)
//
// Each of those is a separable concern. Recommended split:
//   components/settings/AccountSection.tsx     — auth forms + sign-out
//   components/settings/SubscriptionSection.tsx — premium + owned packs
//   components/settings/GameplaySection.tsx     — toggle rows
//   components/settings/AppearanceSection.tsx  — theme + palette picker
//   components/settings/LegalView.tsx          — Terms / Privacy / Acks
// SettingsModal itself would then orchestrate sections and the view stack.
//
// DEBT: `authTabSegment` style is defined but no SegmentedControl uses it
// (the sign-in/sign-up tab switch is now a Pressable link). Dead style — remove.
//
// DEBT: The `title` style (25px Bricolage Grotesque 900) is used for the modal
// header title. The `formTitle` style (17px semibold) is for form section headers.
// The naming collision makes reading createStyles confusing. Rename `title` to
// `modalTitle` or `headerTitle` for clarity.
//
// CONCERN: All auth state (emailMode, authTab, email, password) is local to this
// modal. Closing and re-opening the modal clears them (via onDismiss → setView).
// This is intentional for security (password field reset) but means users lose
// their half-typed email if they accidentally close the modal.
import React, { useState, useEffect } from 'react';
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
  Text as RNText,
} from 'react-native';
import { Text } from './Text';
import X from 'lucide-react-native/dist/cjs/icons/x';
import ChevronLeft from 'lucide-react-native/dist/cjs/icons/chevron-left';
import AtSign from 'lucide-react-native/dist/cjs/icons/at-sign';
import { WebView } from 'react-native-webview';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import Svg, { Rect, Line, Path } from 'react-native-svg';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { usePuzzleStore } from '../stores/puzzleStore';
import { useTheme } from '../hooks/useTheme';
import { rgba } from '../themes/ansi';
import { useEntitlements } from '../hooks/useEntitlements';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { purchasePremium, restorePurchases, PREMIUM_PRODUCT_ID } from '../utils/payments';
import { useProductPrice } from '../hooks/useProductPrice';
import { PALETTES, PALETTE_NAMES } from '../themes/palettes';
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

// CLEANUP: PalettePreview and its supporting constants (PREVIEW_GRID, S, N, bw,
// cs, THICK_H, THICK_V, starPath, STAR, MARK1, MARK2, MR) should live in their
// own file (e.g. components/settings/PalettePreview.tsx). They add ~130 lines
// of module-level setup to an already-large file and are completely independent
// of SettingsModal's state.
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

function PalettePreview({
  paletteTheme,
  coloredRegions,
}: {
  paletteTheme: Theme;
  coloredRegions: boolean;
}) {
  return (
    <Svg width={S} height={S}>
      <Rect x={0} y={0} width={S} height={S} fill={paletteTheme.background} />
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
                : paletteTheme.background
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
        stroke={paletteTheme.red}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Line
        x1={MARK1.cx + MR}
        y1={MARK1.cy - MR}
        x2={MARK1.cx - MR}
        y2={MARK1.cy + MR}
        stroke={paletteTheme.red}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Line
        x1={MARK2.cx - MR}
        y1={MARK2.cy - MR}
        x2={MARK2.cx + MR}
        y2={MARK2.cy + MR}
        stroke={paletteTheme.red}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Line
        x1={MARK2.cx + MR}
        y1={MARK2.cy - MR}
        x2={MARK2.cx - MR}
        y2={MARK2.cy + MR}
        stroke={paletteTheme.red}
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
  first,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
  first?: boolean;
}) {
  return (
    <View style={[styles.row, first && { borderTopWidth: 0 }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View>
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{
            true: theme.blue,
            false: theme.border,
          }}
        />
      </View>
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

  const premiumPrice = useProductPrice(PREMIUM_PRODUCT_ID);

  const { entitlements, packCatalog } = useEntitlements();

  const [view, setView] = useState<
    'main' | 'acknowledgements' | 'terms' | 'privacy'
  >('main');
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    setScrolled(false);
  }, [view]);
  const [emailMode, setEmailMode] = useState<EmailMode>(null);
  const [authTab, setAuthTab] = useState<'signin' | 'signup'>('signin');
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
    await withLoading(async () => {
      await signInWithEmail(email, password);
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
    settings.theme === 'dark'
      ? true
      : settings.theme === 'light'
      ? false
      : systemScheme === 'dark';
  const visiblePalettes = PALETTE_NAMES;
  const paletteRows: (typeof PALETTE_NAMES)[number][][] = [];
  for (let i = 0; i < visiblePalettes.length; i += 3) {
    paletteRows.push(visiblePalettes.slice(i, i + 3));
  }

  return (
    <Modal
      visible={settingsModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeSettings}
      onDismiss={() => setView('main')}
    >
      <View style={styles.container}>
        <View style={[styles.modalHeader, scrolled && styles.modalHeaderBorder]}>
          <View style={styles.modalHeaderSide}>
            {view !== 'main' && (
              <Pressable onPress={() => setView('main')} hitSlop={8}>
                <ChevronLeft size={24} color={theme.text} />
              </Pressable>
            )}
          </View>
          <View style={styles.modalHeaderCenter}>
            <Text style={styles.title}>
              {view === 'acknowledgements'
                ? 'Acknowledgements'
                : view === 'terms'
                ? 'Terms of Use'
                : view === 'privacy'
                ? 'Privacy Policy'
                : 'Settings'}
            </Text>
          </View>
          <View style={styles.modalHeaderSide}>
            {view === 'main' && (
              <Pressable onPress={closeSettings} hitSlop={8}>
                <X size={24} color={theme.text} />
              </Pressable>
            )}
          </View>
        </View>

        {view === 'acknowledgements' && (
          <ScrollView
            onScroll={e => setScrolled(e.nativeEvent.contentOffset.y > 0)}
            scrollEventThrottle={16}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Themes</Text>
              <Text style={[styles.sectionBody, { marginBottom: 16 }]}>
                The color themes in this app are inspired by and closely emulate
                the following open-source projects. Each is used with
                attribution under its respective license.
              </Text>
              {(
                [
                  {
                    name: 'Original',
                    desc: 'Inspired by ',
                    link: 'GitHub Primer',
                    url: 'https://primer.style',
                    suffix: ", GitHub's open-source design system.",
                  },
                  {
                    name: 'Seoul256',
                    desc: 'Based on ',
                    link: 'seoul256.vim',
                    url: 'https://github.com/junegunn/seoul256.vim',
                    suffix: ' by junegunn. Licensed under MIT.',
                  },
                  {
                    name: 'Primer',
                    desc: 'Inspired by ',
                    link: 'GitHub Primer',
                    url: 'https://primer.style',
                    suffix: ", GitHub's design system. Licensed under MIT.",
                  },
                  {
                    name: 'Rosé Pine',
                    desc: 'Based on ',
                    link: 'Rosé Pine',
                    url: 'https://rosepinetheme.com',
                    suffix: ' by the Rosé Pine team. Licensed under MIT.',
                    extra: {
                      text: 'See their branding guidelines.',
                      url: 'https://github.com/rose-pine/rose-pine-theme',
                    },
                  },
                  {
                    name: 'Gruvbox',
                    desc: 'Based on ',
                    link: 'gruvbox',
                    url: 'https://github.com/morhetz/gruvbox',
                    suffix: ' by morhetz. Licensed under MIT.',
                  },
                  {
                    name: 'Tokyo Night',
                    desc: 'Based on ',
                    link: 'Tokyo Night',
                    url: 'https://github.com/enkia/tokyo-night-vscode-theme',
                    suffix: ' by enkia. Licensed under MIT.',
                  },
                ] as const
              ).map(item => (
                <View key={item.name} style={styles.attributionRow}>
                  <Text style={styles.attributionName}>{item.name}</Text>
                  <Text style={styles.attributionBody}>
                    {item.desc}
                    <Text
                      style={styles.attributionLink}
                      onPress={() => Linking.openURL(item.url).catch(() => {})}
                    >
                      {item.link}
                    </Text>
                    {item.suffix}
                    {'extra' in item && item.extra ? (
                      <>
                        {' '}
                        <Text
                          style={styles.attributionLink}
                          onPress={() =>
                            Linking.openURL(item.extra!.url).catch(() => {})
                          }
                        >
                          {item.extra.text}
                        </Text>
                      </>
                    ) : null}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>MIT License</Text>
              <Text style={[styles.sectionBody, { marginBottom: 16 }]}>
                The following projects are distributed under the MIT License:
                seoul256.vim, GitHub Primer, Rosé Pine, gruvbox, and Tokyo
                Night.
              </Text>
              <View style={styles.licenseBox}>
                <RNText style={styles.licenseText}>
                  {`MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`}
                </RNText>
              </View>
            </View>
          </ScrollView>
        )}

        {(view === 'terms' || view === 'privacy') && (
          <WebView
            source={{ uri: view === 'terms' ? TERMS_URL : PRIVACY_POLICY_URL }}
            style={{ flex: 1, backgroundColor: theme.background }}
          />
        )}

        <ScrollView
          onScroll={e => setScrolled(e.nativeEvent.contentOffset.y > 0)}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          style={view !== 'main' ? { display: 'none' } : undefined}
        >
          {/* Account */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {isAnonymous
                ? authTab === 'signin'
                  ? 'Log in'
                  : 'Sign up'
                : 'Account'}
            </Text>
            {isAnonymous ? (
              <>
                {authTab === 'signup' ? (
                  <Text style={styles.sectionBody}>
                    Create an account to keep your progress, streaks, and
                    purchases across devices.
                  </Text>
                ) : (
                  <Text style={styles.sectionBody}>
                    Access your progress, streaks, and purchases across devices.
                  </Text>
                )}

                {emailMode === null && (
                  <View style={{ gap: 12, marginTop: 4 }}>
                    <Pressable
                      style={[
                        styles.secondaryButton,
                        loading && styles.disabled,
                      ]}
                      onPress={() => {
                        setError(null);
                        setEmailMode(authTab);
                      }}
                      disabled={loading}
                    >
                      <View style={styles.buttonRow}>
                        <AtSign size={18} color={theme.text} />
                        <Text style={styles.secondaryButtonText}>
                          {authTab === 'signin'
                            ? 'Log in with Email'
                            : 'Sign up with Email'}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.secondaryButton,
                        loading && styles.disabled,
                      ]}
                      onPress={() => withLoading(signInWithGoogle)}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color={theme.text} />
                      ) : (
                        <View style={styles.buttonRow}>
                          <GoogleIcon size={18} />
                          <Text style={styles.secondaryButtonText}>
                            {authTab === 'signin'
                              ? 'Log in with Google'
                              : 'Sign up with Google'}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                    {Platform.OS === 'ios' && (
                      <Pressable
                        style={[
                          styles.secondaryButton,
                          loading && styles.disabled,
                        ]}
                        onPress={() => withLoading(signInWithApple)}
                        disabled={loading}
                      >
                        {loading ? (
                          <ActivityIndicator color={theme.text} />
                        ) : (
                          <View style={styles.buttonRow}>
                            <AppleIcon size={18} color={theme.text} />
                            <Text style={styles.secondaryButtonText}>
                              {authTab === 'signin'
                                ? 'Log in with Apple'
                                : 'Sign up with Apple'}
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
                      <Text style={styles.linkText}>
                        {authTab === 'signin'
                          ? 'Create an account'
                          : 'Already have an account? Log in'}
                      </Text>
                    </Pressable>
                  </View>
                )}

                {(emailMode === 'signup' || emailMode === 'signin') && (
                  <View>
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
                        <ActivityIndicator color={theme.background} />
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
                    <ActivityIndicator color={theme.background} />
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
            <ToggleRow
              first
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

          {/* General */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>General</Text>
            <ToggleRow
              first
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
              <SegmentedControl
                values={THEME_OPTIONS.map(o => o.label)}
                selectedIndex={THEME_OPTIONS.findIndex(
                  o => o.value === settings.theme,
                )}
                onChange={e =>
                  updateSettings({
                    theme:
                      THEME_OPTIONS[e.nativeEvent.selectedSegmentIndex].value,
                  })
                }
                style={styles.themeSegment}
                tintColor={theme.blue}
                backgroundColor={theme.background}
                fontStyle={{
                  color: theme.text,
                  fontSize: 15,
                  fontWeight: '600',
                }}
                activeFontStyle={{
                  color: theme.background,
                  fontSize: 15,
                  fontWeight: '600',
                }}
              />
            </View>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Color Theme</Text>
            <View style={styles.paletteRow}>
              <View style={styles.swatchGrid}>
                {paletteRows.map((row, rowIdx) => (
                  <View key={rowIdx} style={styles.swatchRow}>
                    {row.map(name => {
                      const active = settings.palette === name;
                      const variant = isCurrentlyDark
                        ? PALETTES[name].dark
                        : PALETTES[name].light;
                      const paletteTheme = buildTheme(variant);
                      return (
                        <Pressable
                          key={name}
                          onPress={() => updateSettings({ palette: name })}
                          style={[
                            styles.swatchCard,
                            {
                              backgroundColor: paletteTheme.background,
                            },
                            active && {
                              borderColor: paletteTheme.text,
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
                                    ? paletteTheme.text
                                    : paletteTheme.text,
                                  1,
                                ),
                              },
                            ]}
                          >
                            {PALETTES[name].label}
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

          {/* Legal */}
          <View style={styles.section}>
            <View style={styles.legalLinks}>
              <Pressable onPress={() => setView('terms')} hitSlop={8}>
                <Text style={styles.privacyLinkText}>Terms of Use</Text>
              </Pressable>
              <Text style={styles.legalSep}>·</Text>
              <Pressable onPress={() => setView('privacy')} hitSlop={8}>
                <Text style={styles.privacyLinkText}>Privacy Policy</Text>
              </Pressable>
              <Text style={styles.legalSep}>·</Text>
              <Pressable
                onPress={() => setView('acknowledgements')}
                hitSlop={8}
              >
                <Text style={styles.privacyLinkText}>Acknowledgements</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    modalHeader: {
      height: 48,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'transparent',
    },
    modalHeaderBorder: {
      borderBottomColor: theme.border,
    },
    modalHeaderSide: {
      width: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalHeaderCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      color: theme.text,
      fontSize: 25,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: '900',
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: theme.spacingXl,
    },
    section: { marginTop: 40, marginBottom: 0 },
    sectionTitle: {
      fontSize: 20,
      color: theme.text,
      lineHeight: 22,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: '900',
      marginBottom: 14,
    },
    sectionBody: {
      fontSize: 15,
      color: theme.textSecondary,
      fontWeight: '500',
      marginTop: -7,
      marginBottom: 14,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      display: 'flex',
      minHeight: 56,
      borderTopWidth: 1,
      borderColor: theme.border,
    },
    rowLabel: {
      fontSize: 17,
      fontWeight: 600,
      color: theme.text,
    },
    themeSegment: {
      width: 240,
      height: 36,
    },
    authTabSegment: {
      height: 36,
    },
    paletteRow: {
      gap: theme.spacingMd,
    },
    swatchGrid: {
      gap: 12,
    },
    swatchRow: {
      flexDirection: 'row',
      gap: 12,
    },

    swatchCard: {
      flex: 1,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: theme.border,
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
      backgroundColor: theme.surface,
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
      backgroundColor: theme.blue,
    },
    premiumBadgeText: {
      fontSize: theme.fontSizeSubhead,
      fontWeight: theme.fontWeightSemibold,
      color: theme.background,
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
      backgroundColor: theme.blue,
    },
    primaryButtonText: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: theme.background,
    },
    secondaryButton: {
      height: 52,
      flex: 1,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: theme.text,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
    },
    secondaryButtonText: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.text,
    },
    buttonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    linkButton: {
      alignItems: 'center',
      paddingVertical: theme.spacingMd,
    },
    linkText: {
      fontSize: theme.fontSizeSubhead,
      color: theme.text,
    },
    formTitle: {
      fontSize: theme.fontSizeBody,
      fontWeight: theme.fontWeightSemibold,
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
      fontSize: theme.fontSizeCallout,
    },
    destructiveButton: {
      height: 52,
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
    },
    destructiveButtonText: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: theme.red,
    },
    legalLinks: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: theme.spacingLg,
      gap: 6,
    },
    privacyLinkText: {
      fontSize: 13,
      color: theme.textSecondary,
    },
    legalSep: {
      fontSize: theme.fontSizeSubhead,
      color: theme.textSecondary,
    },
    confirmEmailBox: {
      gap: theme.spacingMd,
    },
    confirmEmailTitle: {
      fontSize: theme.fontSizeBody,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    confirmEmailBody: {
      fontSize: theme.fontSizeCallout,
      color: theme.textSecondary,
      lineHeight: 22,
    },
    confirmEmailAddress: {
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    passwordHint: {
      fontSize: theme.fontSizeSubhead,
      color: theme.textSecondary,
    },
    passwordHintMet: {
      color: theme.blue,
    },
    disabled: { opacity: 0.6 },
    error: {
      fontSize: theme.fontSizeSubhead,
      color: theme.red,
      textAlign: 'center',
    },
    attributionRow: {
      paddingVertical: 12,
      borderTopWidth: 1,
      borderColor: theme.border,
      gap: 4,
    },
    attributionName: {
      fontSize: theme.fontSizeCallout,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    attributionBody: {
      fontSize: theme.fontSizeBody,
      color: theme.textSecondary,
      lineHeight: 22,
    },
    attributionLink: {
      color: theme.blue,
      textDecorationLine: 'underline',
    },
    licenseBox: {
      backgroundColor: theme.surface,
      borderRadius: theme.radiusMd,
      padding: theme.spacingLg,
    },
    licenseText: {
      fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
      fontSize: 12,
      lineHeight: 18,
      color: theme.textSecondary,
    },
  });
};
