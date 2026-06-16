import React, {
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
import { CircleButton } from '../../shared/ui/CircleButton';
import ChevronLeft from 'lucide-react-native/dist/cjs/icons/chevron-left';
import MoreHorizontal from 'lucide-react-native/dist/cjs/icons/ellipsis';
import Check from 'lucide-react-native/dist/cjs/icons/check';
import Lock from 'lucide-react-native/dist/cjs/icons/lock';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useTheme } from '../../shared/theme/useTheme';
import { loadAllCompletionData } from '../../shared/lib/progress';
import { SCREEN_HEADER_HEIGHT } from '../../shared/lib/layout';
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
  const styles = useMemo(() => createStyles(theme, insets), [theme, insets]);

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
  // The current period (today / this week / this month) isn't in keySet — it's
  // the live challenge, played for free and stored without an archive key.
  const currentKey = useMemo(() => getCurrentKey(type), [type]);

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

  // Tapping a challenge: the current period opens the live puzzle (free, same as
  // Home); past challenges are premium — everyone else gets the paywall.
  const onChallengePress = useCallback(
    (dateKey: string) => {
      const catalog = useEntitlementsStore.getState().packCatalog;
      const packId = catalog.find(p => p.type === type)?.id;
      if (!packId) return;
      if (dateKey === currentKey) {
        navigation.navigate('Puzzle', { packId });
        return;
      }
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
      navigation.navigate('Puzzle', { packId, archiveKey: dateKey });
    },
    [isPremium, type, navigation, t, currentKey],
  );

  // One record per date (see usePackData): completion is stored under the
  // live id whether the puzzle was played live or opened from the archive.
  const isCompleted = useCallback(
    (dateKey: string) => completedIds.has(`${type}:${dateKey}`),
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
        <CircleButton ghost onPress={() => navigation.goBack()}>
          <ChevronLeft size={26} strokeWidth={2} color={theme.text} />
        </CircleButton>
        <View>
          <Text role="title3" style={styles.headerTitle}>
            {t(`library.archiveHeader${capitalize(type)}`)}
          </Text>
          <Text style={styles.bars} role="subhead">
            {t('streaks.current')}:{' '}
            {t(`streaks.${STREAK_UNIT_KEY[type]}`, { count: current })} ·{' '}
            {t('streaks.best')}:{' '}
            {t(`streaks.${STREAK_UNIT_KEY[type]}`, { count: best })}
          </Text>
        </View>
        <CircleButton
          ghost
          onPress={() => useSettingsStore.getState().openSettings()}
        >
          <MoreHorizontal size={26} strokeWidth={2} color={theme.text} />
        </CircleButton>
      </View>

      <View style={styles.body}>
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
          <WeekCalendar width={width} {...calendarProps} />
        ) : (
          <YearCalendar width={width} {...calendarProps} />
        )}
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
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
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
          style={[styles.monthTitle, isCurrentMonth && { color: theme.text }]}
        >
          {monthName}&nbsp;
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
          const today = key === todayKey;
          const completed = (challenge || today) && isCompleted(key);
          return (
            <Pressable
              key={key}
              disabled={!challenge && !today}
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
  width,
  insets,
  keySet,
  isCompleted,
  onPress,
  onScroll,
  theme,
  styles,
  t,
}: CalendarProps & { width: number }) {
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
  // Group weeks into month sections (an ISO week belongs to its Thursday's
  // month) so each section can render as a 2-wide grid.
  const sections = useMemo(() => {
    const out: { id: string; label: string; weeks: string[] }[] = [];
    for (const key of weekKeys) {
      const monday = archiveKeyToDate('weekly', key);
      const thursday = new Date(monday.getTime() + 3 * MS_PER_DAY);
      const id = `${thursday.getFullYear()}-${thursday.getMonth()}`;
      let section = out[out.length - 1];
      if (!section || section.id !== id) {
        section = {
          id,
          label: thursday.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          }),
          weeks: [],
        };
        out.push(section);
      }
      section.weeks.push(key);
    }
    return out;
  }, [weekKeys]);
  const tile = Math.floor((width - 2 * 24 - 12) / 2);
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
      {sections.map(section => (
        <View key={section.id} style={styles.weekBlock}>
          <Text role="title3" style={styles.sectionHeader}>
            {section.label}
          </Text>
          <View style={styles.weekGrid}>
            {section.weeks.map(key => {
              const monday = archiveKeyToDate('weekly', key);
              const isCurrent = key === currentWeekKey;
              const challenge = keySet.has(key);
              const completed = (challenge || isCurrent) && isCompleted(key);

              return (
                <Pressable
                  key={key}
                  disabled={!isCurrent && !challenge}
                  onPress={() => onPress(key)}
                  style={[
                    styles.weekRow,
                    { width: tile },
                    completed && styles.weekRowCompleted,
                    isCurrent && styles.weekRowCurrent,
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
                    role="callout"
                    style={[
                      styles.weekRange,
                      completed && { color: theme.background },
                    ]}
                  >
                    {weekRangeLabel(monday)}
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
              const isCurrent = key === currentMonthKey;
              const completed = (challenge || isCurrent) && isCompleted(key);
              const short = new Date(year, m, 1).toLocaleDateString('en-US', {
                month: 'short',
              });
              return (
                <Pressable
                  key={m}
                  disabled={!isCurrent && !challenge}
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
                    role="callout"
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

const createStyles = (theme: Theme, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },

    header: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      height: SCREEN_HEADER_HEIGHT + insets.top,
      paddingTop: insets.top,
      backgroundColor: theme.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.background,
    },
    // Bottom hairline shown once a calendar scrolls off the top.
    headerBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerTitle: {
      textAlign: 'center',
      color: theme.text,
    },
    body: {
      flex: 1,
      paddingTop: SCREEN_HEADER_HEIGHT + insets.top + 8,
    },
    // Streak bars
    bars: {
      flexDirection: 'row',
      color: theme.textSecondary,
      marginTop: 3,
    },
    bar: {
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
      color: theme.text,
    },
    barValue: {
      color: theme.textSecondary,
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
      marginBottom: 22,
    },
    monthTitleRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginBottom: 14,
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
      padding: 4,
    },
    day: {
      flex: 1,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
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
      borderWidth: 1,
      borderColor: theme.text,
      backgroundColor: theme.text,
    },
    dayText: {
      color: theme.text,
    },
    dayTextMuted: {
      color: theme.textSecondary,
      opacity: 0.5,
    },

    // Weekly — week grid (2-wide, grouped by month)
    sectionHeader: {
      color: theme.text,
      marginBottom: 14,
      marginTop: 0,
    },
    weekBlock: {
      marginBottom: 22,
    },
    weekGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    weekRow: {
      height: 48,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    weekRowCompleted: {
      backgroundColor: theme.text,
    },
    weekRowCurrent: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.text,
    },
    weekRange: {
      color: theme.text,
      fontWeight: 600,
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
      height: 48,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    monthTileChallenge: {
      backgroundColor: theme.surface,
    },
    monthTileCompleted: {
      backgroundColor: theme.text,
    },
    monthTileCurrent: {
      borderWidth: 1,
      borderColor: theme.blue,
    },
    monthTileCheck: {
      position: 'absolute',
      top: 8,
      right: 8,
    },
    monthTileText: {
      color: theme.text,
      fontWeight: '600',
    },
    monthTileTextMuted: {
      color: theme.textSecondary,
      opacity: 0.5,
    },
  });
