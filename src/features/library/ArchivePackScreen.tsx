import React, {
  Fragment,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Text } from '../../shared/ui/Text';
import X from 'lucide-react-native/dist/cjs/icons/x';
import Check from 'lucide-react-native/dist/cjs/icons/check';
import Lock from 'lucide-react-native/dist/cjs/icons/lock';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useTheme } from '../../shared/theme/useTheme';
import { loadAllCompletionData } from '../../shared/lib/progress';
import {
  getActiveStreak,
  getCurrentKey,
  getPastDateKeys,
  archiveKeyToDate,
  capitalize,
  RELEASE_DATE,
  STREAK_UNIT_KEY,
} from '../../shared/lib/streakDate';
import { useEntitlementsStore } from '../../shared/stores/entitlementsStore';
import { useSettingsStore } from '../../shared/stores/settingsStore';
import { useAuthStore } from '../../shared/stores/authStore';
import { useEntitlements } from '../../shared/hooks/useEntitlements';
import { useStreakRows } from '../../shared/hooks/useStreakRows';
import { useScrollBorder } from '../../shared/hooks/useScrollBorder';
import type { RootStackParamList, Theme } from '../../types';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MS_PER_DAY = 86400000;

type Styles = ReturnType<typeof createStyles>;

// One month of the daily calendar.
type MonthPage = { year: number; month: number };

// All months from launch through the current month, oldest first. The daily
// calendar stacks these vertically and opens scrolled to the latest.
function getMonthPages(now: Date): MonthPage[] {
  const pages: MonthPage[] = [];
  let y = RELEASE_DATE.getFullYear();
  let m = RELEASE_DATE.getMonth();
  const endY = now.getFullYear();
  const endM = now.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    pages.push({ year: y, month: m });
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return pages;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// "Jun 2 – 8" within a month, "Jun 30 – Jul 6" across one.
function weekRangeLabel(monday: Date): string {
  const sunday = new Date(monday.getTime() + 6 * MS_PER_DAY);
  const m1 = monday.toLocaleDateString('en-US', { month: 'short' });
  const m2 = sunday.toLocaleDateString('en-US', { month: 'short' });
  if (m1 === m2) {
    return `${m1} ${monday.getDate()} – ${sunday.getDate()}`;
  }
  return `${m1} ${monday.getDate()} – ${m2} ${sunday.getDate()}`;
}

// Scrolls a vertical list to its bottom once, the first time content lays out —
// every archive view opens on the most recent period, the way Calendar opens
// on today.
function useScrollToEndOnce() {
  const ref = useRef<ScrollView>(null);
  const done = useRef(false);
  const onContentSizeChange = useCallback(() => {
    if (done.current) return;
    done.current = true;
    ref.current?.scrollToEnd({ animated: false });
  }, []);
  return { ref, onContentSizeChange };
}

export function ArchivePackScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ArchivePack'>) {
  const { type } = route.params;
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { entitlements } = useEntitlements();
  const isPremium = entitlements.isPremium;
  const userId = useAuthStore(s => s.user?.id);
  const { streaks } = useStreakRows(userId);
  const streak = streaks.find(s => s.type === type);
  const current = streak ? getActiveStreak(streak, type) : 0;
  const best = streak ? streak.best : 0;

  // Past challenge keys for this cadence (excludes today + the future).
  const dateKeys = useMemo(() => getPastDateKeys(type), [type]);
  const keySet = useMemo(() => new Set(dateKeys), [dateKeys]);

  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  // Shows the header's bottom hairline once a calendar scrolls off the top.
  const { scrolled, onScroll } = useScrollBorder();

  useEffect(() => {
    loadAllCompletionData().then(ids => {
      setCompletedIds(ids);
      setLoading(false);
    });
  }, []);

  // Tapping a challenge: premium plays it, everyone else gets the paywall.
  const onChallengePress = useCallback(
    (dateKey: string) => {
      if (!isPremium) {
        Alert.alert(t('streaks.premiumTitle'), t('streaks.premiumBody'), [
          { text: t('streaks.notNow'), style: 'cancel' },
          {
            text: t('streaks.upgrade'),
            onPress: () => useSettingsStore.getState().openSettings(),
          },
        ]);
        return;
      }
      const catalog = useEntitlementsStore.getState().packCatalog;
      const packId = catalog.find(p => p.type === type)?.id;
      if (!packId) return;
      navigation.navigate('Puzzle', { packId, archiveKey: dateKey });
    },
    [isPremium, type, navigation, t],
  );

  const isCompleted = useCallback(
    (dateKey: string) => completedIds.has(`${type}:archive:${dateKey}`),
    [completedIds, type],
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator
          style={StyleSheet.absoluteFill}
          color={theme.textSecondary}
        />
      </View>
    );
  }

  const calendarProps = {
    insets,
    keySet,
    isCompleted,
    onPress: onChallengePress,
    onScroll,
    theme,
    styles,
    t,
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, scrolled && styles.headerBorder]}>
        <View style={styles.headerSide} />
        <View style={styles.headerCenter}>
          <Text role="title3" style={styles.headerTitle}>
            {t(`library.archiveHeader${capitalize(type)}`)}
          </Text>
        </View>
        <View style={styles.headerSide}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <X size={24} color={theme.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.bars}>
          <StreakBar
            label={t('streaks.current')}
            value={t(`streaks.${STREAK_UNIT_KEY[type]}`, { count: current })}
            fillRatio={best > 0 ? current / best : current > 0 ? 1 : 0}
            highlight
            styles={styles}
          />
          <StreakBar
            label={t('streaks.best')}
            value={t(`streaks.${STREAK_UNIT_KEY[type]}`, { count: best })}
            fillRatio={best > 0 ? 1 : 0}
            styles={styles}
          />
        </View>

        {!isPremium && (
          <View style={styles.lockNote}>
            <Lock size={13} color={theme.textSecondary} strokeWidth={2.5} />
            <Text role="footnote" style={styles.lockNoteText}>
              {t('streaks.premiumBody')}
            </Text>
          </View>
        )}

        {type === 'daily' ? (
          <MonthCalendar width={width} {...calendarProps} />
        ) : type === 'weekly' ? (
          <WeekCalendar {...calendarProps} />
        ) : (
          <YearCalendar width={width} {...calendarProps} />
        )}
      </View>
    </View>
  );
}

// ── Streak bar ──────────────────────────────────────────────────────────────
// A horizontal bar whose fill shows current relative to best.
function StreakBar({
  label,
  value,
  fillRatio,
  highlight,
  styles,
}: {
  label: string;
  value: string;
  fillRatio: number;
  highlight?: boolean;
  styles: Styles;
}) {
  const pct = Math.max(0, Math.min(1, fillRatio)) * 100;
  return (
    <View style={styles.bar}>
      <View
        style={[
          styles.barFill,
          { width: `${pct}%` },
          highlight ? styles.barFillHighlight : styles.barFillMuted,
        ]}
      />
      <View style={styles.barContent}>
        <Text role="subhead" style={styles.barLabel}>
          {label}
        </Text>
        <Text role="headline" style={styles.barValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

type CalendarProps = {
  insets: EdgeInsets;
  keySet: Set<string>;
  isCompleted: (k: string) => boolean;
  onPress: (k: string) => void;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  theme: Theme;
  styles: Styles;
  t: TFunction;
};

// ── Daily → month view ───────────────────────────────────────────────────────
// Apple Calendar's month view: a fixed weekday header over a vertical stack of
// month grids, opening on the latest month. Days are tappable circles.
function MonthCalendar({
  width,
  insets,
  keySet,
  isCompleted,
  onPress,
  onScroll,
  theme,
  styles,
}: CalendarProps & { width: number }) {
  const months = useMemo(() => getMonthPages(new Date()), []);
  const todayKey = getCurrentKey('daily');
  const cell = Math.floor((width - 2 * 24) / 7);
  const scroll = useScrollToEndOnce();

  return (
    <View style={styles.calendarFlex}>
      <View style={styles.weekdayHeader}>
        {WEEKDAY_LETTERS.map((letter, i) => (
          <View key={i} style={[styles.weekdayCell, { width: cell }]}>
            <Text role="footnote" style={styles.weekdayLetter}>
              {letter}
            </Text>
          </View>
        ))}
      </View>
      <ScrollView
        ref={scroll.ref}
        onContentSizeChange={scroll.onContentSizeChange}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.calendarContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
      >
        {months.map(page => (
          <MonthGrid
            key={`${page.year}-${page.month}`}
            page={page}
            cell={cell}
            keySet={keySet}
            todayKey={todayKey}
            isCompleted={isCompleted}
            onPress={onPress}
            theme={theme}
            styles={styles}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function MonthGrid({
  page,
  cell,
  keySet,
  todayKey,
  isCompleted,
  onPress,
  theme,
  styles,
}: {
  page: MonthPage;
  cell: number;
  keySet: Set<string>;
  todayKey: string;
  isCompleted: (k: string) => boolean;
  onPress: (k: string) => void;
  theme: Theme;
  styles: Styles;
}) {
  const { year, month } = page;
  const now = new Date();
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth();
  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
  });
  const offset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const slots: (number | null)[] = [];
  for (let i = 0; i < offset; i++) slots.push(null);
  for (let d = 1; d <= daysInMonth; d++) slots.push(d);

  return (
    <View style={styles.monthBlock}>
      <View style={styles.monthTitleRow}>
        <Text
          role="title3"
          style={[styles.monthTitle, isCurrentMonth && { color: theme.blue }]}
        >
          {monthName}
        </Text>
        <Text role="subhead" style={styles.monthYear}>
          {year}
        </Text>
      </View>
      <View style={styles.daysGrid}>
        {slots.map((day, i) => {
          if (day === null) {
            return <View key={`b${i}`} style={{ width: cell, height: cell }} />;
          }
          const key = `${year}-${pad(month + 1)}-${pad(day)}`;
          const challenge = keySet.has(key);
          const completed = challenge && isCompleted(key);
          const today = key === todayKey;
          return (
            <Pressable
              key={key}
              disabled={!challenge}
              onPress={() => onPress(key)}
              style={[styles.dayCell, { width: cell, height: cell }]}
            >
              <View
                style={[
                  styles.day,
                  challenge && styles.dayChallenge,
                  completed && styles.dayCompleted,
                  today && styles.dayToday,
                ]}
              >
                {completed ? (
                  <Check size={14} color={theme.background} strokeWidth={3} />
                ) : (
                  <Text
                    role="subhead"
                    style={[styles.dayText, !challenge && styles.dayTextMuted]}
                  >
                    {day}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── Weekly → week view ────────────────────────────────────────────────────────
// Apple Calendar's week list: weeks stacked vertically under month headers,
// each a tappable row showing its date span. Opens on the most recent week.
function WeekCalendar({
  insets,
  keySet,
  isCompleted,
  onPress,
  onScroll,
  theme,
  styles,
  t,
}: CalendarProps) {
  const now = new Date();
  const currentWeekKey = getCurrentKey('weekly', now);
  const weekKeys = useMemo(() => {
    const out: string[] = [];
    let d = new Date(RELEASE_DATE);
    let guard = 0;
    while (getCurrentKey('weekly', d) <= currentWeekKey && guard < 600) {
      const key = getCurrentKey('weekly', d);
      if (out[out.length - 1] !== key) out.push(key);
      d = new Date(d.getTime() + 7 * MS_PER_DAY);
      guard++;
    }
    return out;
  }, [currentWeekKey]);
  const scroll = useScrollToEndOnce();

  let lastSection = '';

  return (
    <ScrollView
      ref={scroll.ref}
      onContentSizeChange={scroll.onContentSizeChange}
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.calendarContent,
        { paddingBottom: insets.bottom + 32 },
      ]}
    >
      {weekKeys.map(key => {
        const monday = archiveKeyToDate('weekly', key);
        // ISO weeks belong to the month/year of their Thursday.
        const thursday = new Date(monday.getTime() + 3 * MS_PER_DAY);
        const section = `${thursday.getFullYear()}-${thursday.getMonth()}`;
        const showHeader = section !== lastSection;
        lastSection = section;

        const isCurrent = key === currentWeekKey;
        const challenge = keySet.has(key);
        const completed = challenge && isCompleted(key);
        const weekNo = Number(key.split('-W')[1]);

        return (
          <Fragment key={key}>
            {showHeader && (
              <Text role="headline" style={styles.sectionHeader}>
                {thursday.toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
            )}
            <Pressable
              disabled={!challenge}
              onPress={() => onPress(key)}
              style={[
                styles.weekRow,
                completed && styles.weekRowCompleted,
                isCurrent && styles.weekRowCurrent,
              ]}
            >
              <View>
                <Text
                  role="headline"
                  style={[
                    styles.weekRange,
                    completed && { color: theme.background },
                  ]}
                >
                  {weekRangeLabel(monday)}
                </Text>
                <Text
                  role="subhead"
                  style={[
                    styles.weekSub,
                    completed && styles.weekSubCompleted,
                    completed && { color: theme.background },
                  ]}
                >
                  {isCurrent
                    ? t('library.currentWeek')
                    : t('library.weekLabel', { n: weekNo })}
                </Text>
              </View>
              {completed && (
                <Check size={20} color={theme.background} strokeWidth={3} />
              )}
            </Pressable>
          </Fragment>
        );
      })}
    </ScrollView>
  );
}

// ── Monthly → year view ───────────────────────────────────────────────────────
// Apple Calendar's year view: each year a grid of month tiles. Tap a month to
// open its puzzle. Opens on the latest year.
function YearCalendar({
  width,
  insets,
  keySet,
  isCompleted,
  onPress,
  onScroll,
  theme,
  styles,
}: CalendarProps & { width: number }) {
  const now = new Date();
  const currentMonthKey = getCurrentKey('monthly', now);
  const currentYear = now.getFullYear();
  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = RELEASE_DATE.getFullYear(); y <= currentYear; y++) {
      out.push(y);
    }
    return out;
  }, [currentYear]);
  const tile = Math.floor((width - 2 * 24 - 2 * 12) / 3);
  const scroll = useScrollToEndOnce();

  return (
    <ScrollView
      ref={scroll.ref}
      onContentSizeChange={scroll.onContentSizeChange}
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.calendarContent,
        { paddingBottom: insets.bottom + 32 },
      ]}
    >
      {years.map(year => (
        <View key={year} style={styles.yearBlock}>
          <Text role="title3" style={styles.yearLabel}>
            {year}
          </Text>
          <View style={styles.monthTiles}>
            {Array.from({ length: 12 }, (_, m) => {
              const key = `${year}-${pad(m + 1)}`;
              const challenge = keySet.has(key);
              const completed = challenge && isCompleted(key);
              const isCurrent = key === currentMonthKey;
              const short = new Date(year, m, 1).toLocaleDateString('en-US', {
                month: 'short',
              });
              return (
                <Pressable
                  key={m}
                  disabled={!challenge}
                  onPress={() => onPress(key)}
                  style={[
                    styles.monthTile,
                    { width: tile },
                    challenge && styles.monthTileChallenge,
                    completed && styles.monthTileCompleted,
                    isCurrent && styles.monthTileCurrent,
                  ]}
                >
                  {completed && (
                    <View style={styles.monthTileCheck}>
                      <Check
                        size={14}
                        color={theme.background}
                        strokeWidth={3}
                      />
                    </View>
                  )}
                  <Text
                    role="headline"
                    style={[
                      styles.monthTileText,
                      completed && { color: theme.background },
                      isCurrent && { color: theme.blue },
                      !challenge && !isCurrent && styles.monthTileTextMuted,
                    ]}
                  >
                    {short}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },

    header: {
      height: 70,
      paddingTop: 24,
      paddingBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    // Bottom hairline shown once a calendar scrolls off the top.
    headerBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    headerSide: {
      width: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      color: theme.text,
    },
    body: {
      flex: 1,
      paddingTop: 8,
    },
    // Streak bars
    bars: {
      paddingHorizontal: 24,
      gap: 20,
      flexDirection: 'row',
    },
    bar: {
      height: 56,
      borderRadius: theme.radiusMd,
      borderWidth: 1,
      flex: 1,
      borderColor: theme.border,
      overflow: 'hidden',
      justifyContent: 'center',
    },
    barFill: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
    },
    barFillHighlight: {
      backgroundColor: theme.border,
    },
    barFillMuted: {
      backgroundColor: theme.surface,
    },
    barContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
    },
    barLabel: {
      color: theme.textSecondary,
    },
    barValue: {
      color: theme.text,
    },
    lockNote: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 24,
      marginTop: 14,
    },
    lockNoteText: {
      color: theme.textSecondary,
      flexShrink: 1,
    },

    // Shared calendar scaffolding
    calendarFlex: {
      flex: 1,
    },
    calendarContent: {
      paddingHorizontal: 24,
      paddingTop: 20,
    },

    // Daily — month view
    weekdayHeader: {
      flexDirection: 'row',
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: 8,
    },
    weekdayCell: {
      alignItems: 'center',
    },
    weekdayLetter: {
      color: theme.textSecondary,
    },
    monthBlock: {
      marginBottom: 28,
    },
    monthTitleRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
      marginBottom: 12,
    },
    monthTitle: {
      color: theme.text,
    },
    monthYear: {
      color: theme.textSecondary,
    },
    daysGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    dayCell: {
      padding: 3,
    },
    day: {
      flex: 1,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayChallenge: {
      backgroundColor: theme.surface,
    },
    dayCompleted: {
      backgroundColor: theme.text,
    },
    dayToday: {
      borderWidth: 1.5,
      borderColor: theme.blue,
    },
    dayText: {
      color: theme.text,
    },
    dayTextMuted: {
      color: theme.textSecondary,
      opacity: 0.5,
    },

    // Weekly — week list
    sectionHeader: {
      color: theme.text,
      marginBottom: 10,
      marginTop: 4,
    },
    weekRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.surface,
      borderRadius: theme.radiusMd,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 8,
    },
    weekRowCompleted: {
      backgroundColor: theme.text,
    },
    weekRowCurrent: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: theme.blue,
    },
    weekRange: {
      color: theme.text,
    },
    weekSub: {
      color: theme.textSecondary,
      marginTop: 2,
    },
    weekSubCompleted: {
      opacity: 0.7,
    },

    // Monthly — year view
    yearBlock: {
      marginBottom: 28,
    },
    yearLabel: {
      color: theme.text,
      marginBottom: 12,
    },
    monthTiles: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    monthTile: {
      height: 64,
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthTileChallenge: {
      backgroundColor: theme.surface,
    },
    monthTileCompleted: {
      backgroundColor: theme.text,
    },
    monthTileCurrent: {
      borderWidth: 1.5,
      borderColor: theme.blue,
    },
    monthTileCheck: {
      position: 'absolute',
      top: 8,
      right: 8,
    },
    monthTileText: {
      color: theme.text,
    },
    monthTileTextMuted: {
      color: theme.textSecondary,
      opacity: 0.5,
    },
  });
