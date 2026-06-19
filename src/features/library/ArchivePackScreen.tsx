import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
import Lock from 'lucide-react-native/dist/cjs/icons/lock';
import Check from 'lucide-react-native/dist/cjs/icons/check';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
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
import { track } from '../../shared/lib/telemetry';
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

// The set of date keys making up the live daily streak. This is the *official*
// streak — `current` days ending at `lastCompletedKey` — not just any run of
// completed days: archive puzzles can be solved out of order, so consecutive
// completed days don't necessarily belong to the streak the counter tracks.
// Only days in this set get a connector; everything else reads as
// completed-but-separate. `current` is the active count (0 when broken).
function getDailyStreakKeys(
  current: number,
  lastCompletedKey: string,
): Set<string> {
  const set = new Set<string>();
  if (current <= 0 || !lastCompletedKey) return set;
  const [y, m, d] = lastCompletedKey.split('-').map(Number);
  const cursor = new Date(y, m - 1, d);
  for (let i = 0; i < current; i++) {
    set.add(
      `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(
        cursor.getDate(),
      )}`,
    );
    cursor.setDate(cursor.getDate() - 1);
  }
  return set;
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

  // Funnel: record that the archive was opened — measures whether users discover
  // it. Once per mount (plain useEffect, not focus) so returning from a finished
  // puzzle doesn't double-count.
  useEffect(() => {
    track('streak_archive_view', { meta: { type, is_premium: isPremium } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload on every focus, not just mount: finishing a puzzle pops back to this
  // still-mounted screen, so a one-shot mount effect would leave completion
  // state stale and the just-solved day uncolored.
  useFocusEffect(
    useCallback(() => {
      loadAllCompletionData().then(ids => {
        setCompletedIds(ids);
        setLoading(false);
      });
    }, []),
  );

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
        track('streak_archive_gate', { meta: { type } });
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
    <View testID="archive-root" style={styles.container}>
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
          <View testID="archive-premium-note" style={styles.lockNote}>
            <Lock size={14} color={theme.textSecondary} strokeWidth={2.5} />
            <Text role="footnote" style={styles.lockNoteText}>
              {t('streaks.premiumBody')}
            </Text>
          </View>
        )}

        {type === 'daily' ? (
          <MonthCalendar
            width={width}
            current={current}
            lastCompletedKey={streak?.lastCompletedKey ?? ''}
            {...calendarProps}
          />
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
  current,
  lastCompletedKey,
  insets,
  keySet,
  isCompleted,
  onPress,
  onScroll,
  theme,
  styles,
}: CalendarProps & {
  width: number;
  current: number;
  lastCompletedKey: string;
}) {
  const months = useMemo(() => getMonthPages(new Date()), []);
  const todayKey = getCurrentKey('daily');
  const cell = Math.floor((width - 2 * 24) / 7);
  const scroll = useScrollToEndOnce();
  // Days that may be linked by a connector — only the live streak qualifies.
  const streakKeys = useMemo(
    () => getDailyStreakKeys(current, lastCompletedKey),
    [current, lastCompletedKey],
  );

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
            streakKeys={streakKeys}
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
  streakKeys,
  isCompleted,
  onPress,
  theme,
  styles,
}: {
  page: MonthPage;
  cell: number;
  keySet: Set<string>;
  todayKey: string;
  streakKeys: Set<string>;
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

  // Whether a given day of this month is a completed challenge. Used both to
  // color a day and to decide if it should visually join its neighbour, so a
  // streak of consecutive days reads as one continuous bar.
  const dayCompleted = (d: number) => {
    if (d < 1 || d > daysInMonth) return false;
    const k = `${year}-${pad(month + 1)}-${pad(d)}`;
    return (keySet.has(k) || k === todayKey) && isCompleted(k);
  };

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
          // Connect to a completed neighbour only within the same week row, so a
          // streak links across a row and breaks cleanly at week boundaries. The
          // connector is reserved for the live streak: both this day and the next
          // must belong to it, so a completed-but-broken run shows no bar.
          const col = (offset + day - 1) % 7;
          const nextKey = `${year}-${pad(month + 1)}-${pad(day + 1)}`;
          const joinRight =
            completed &&
            col !== 6 &&
            dayCompleted(day + 1) &&
            streakKeys.has(key) &&
            streakKeys.has(nextKey);
          const fillColor = today ? theme.text : theme.border;
          // A thin bar bridging this circle's centre to the next day's. It sits
          // behind both circles (drawn first, and the next cell paints over its
          // right end), so each day stays a full circle and only the gap shows.
          const connectorHeight = cell - 8;
          return (
            <Pressable
              key={key}
              disabled={!challenge && !today}
              onPress={() => onPress(key)}
              style={[styles.dayCell, { width: cell, height: cell }]}
            >
              {joinRight && (
                <View
                  style={[
                    styles.dayConnector,
                    {
                      backgroundColor: fillColor,
                      left: cell / 2,
                      width: cell,
                      top: (cell - connectorHeight) / 2,
                      height: connectorHeight,
                    },
                  ]}
                />
              )}
              {completed && (
                <View
                  style={[styles.dayFill, { backgroundColor: fillColor }]}
                />
              )}
              <View
                style={[styles.day, today && !completed && styles.dayToday]}
              >
                <Text
                  role="callout"
                  style={[
                    styles.dayText,

                    !challenge && styles.dayTextMuted,
                    completed && styles.dayTextCompleted,
                    today && styles.todayText,
                    completed && today && styles.dayTextCompletedToday,
                  ]}
                >
                  {day}
                </Text>
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
                    isCurrent && !completed && styles.weekRowCurrent,
                    completed && !isCurrent && styles.weekRowCompleted,
                    completed && isCurrent && styles.weekRowCurrentCompleted,
                  ]}
                >
                  {completed && (
                    <View style={styles.weekCheck}>
                      <Check
                        size={16}
                        color={isCurrent ? theme.background : theme.text}
                        strokeWidth={3}
                      />
                    </View>
                  )}
                  <Text
                    role="callout"
                    style={[
                      styles.weekRange,
                      completed && isCurrent && { color: theme.background },
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
                    isCurrent && !completed && styles.monthTileCurrent,
                    completed && !isCurrent && styles.monthTileCompleted,
                    completed && isCurrent && styles.monthTileCurrentCompleted,
                  ]}
                >
                  {completed && (
                    <View style={styles.monthTileCheck}>
                      <Check
                        size={16}
                        color={isCurrent ? theme.background : theme.text}
                        strokeWidth={3}
                      />
                    </View>
                  )}
                  <Text
                    role="callout"
                    style={[
                      styles.monthTileText,
                      !challenge && !isCurrent && styles.monthTileTextMuted,
                      completed && isCurrent && { color: theme.background },
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
    // Streak summary line under the header title ("current · best").
    bars: {
      flexDirection: 'row',
      color: theme.textSecondary,
      marginTop: 3,
    },
    lockNote: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: 20,
      marginTop: 9,
      marginBottom: 9,
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
      paddingHorizontal: 20,
      paddingTop: 20,
    },

    // Daily — month view
    weekdayHeader: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      paddingTop: 8,
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
      lineHeight: 28,
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

      alignItems: 'center',
      justifyContent: 'center',
    },
    // Completion fill behind a day — always a full circle, inset 4px to match
    // dayCell padding. Streak links are drawn separately (dayConnector) so the
    // circle shape never changes.
    dayFill: {
      position: 'absolute',
      top: 4,
      bottom: 4,
      left: 4,
      right: 4,
      borderRadius: 100,
    },
    dayConnector: {
      position: 'absolute',
    },
    dayToday: {
      borderRadius: 100,
      backgroundColor: theme.background,
      borderWidth: 2,
      borderColor: theme.text,
    },
    dayText: {
      color: theme.text,
      fontWeight: '600',
    },
    todayText: {
      color: theme.text,
      fontWeight: '600',
    },
    dayTextMuted: {
      color: theme.textSecondary,
    },
    dayTextCompleted: {
      color: theme.text,
    },
    dayTextCompletedToday: {
      color: theme.background,
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: theme.border,
      backgroundColor: theme.background,
    },
    // Past completed: filled with the border tone, leading check.
    weekRowCompleted: {
      backgroundColor: theme.border,
    },
    // This week, not yet solved: emphasized outline only.
    weekRowCurrent: {
      backgroundColor: theme.background,
      borderColor: theme.text,
    },
    // This week, solved: fully filled, no border, inverted text + check.
    weekRowCurrentCompleted: {
      backgroundColor: theme.text,
      borderWidth: 0,
    },
    // Leading check pinned to the front of a completed week button.
    weekCheck: {
      position: 'absolute',
      left: 12,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
    weekRange: {
      color: theme.text,
      fontWeight: '600',
    },

    // Monthly — year view
    yearBlock: {
      marginBottom: 22,
    },
    yearLabel: {
      color: theme.text,
      marginBottom: 14,
    },
    monthTiles: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    monthTile: {
      height: 48,
      borderRadius: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: theme.border,
      backgroundColor: theme.background,
    },
    // Past completed: filled with the border tone, leading check.
    monthTileCompleted: {
      backgroundColor: theme.border,
    },
    // This month, not yet solved: emphasized outline only.
    monthTileCurrent: {
      backgroundColor: theme.background,
      borderColor: theme.text,
    },
    // This month, solved: fully filled, no border, inverted text + check.
    monthTileCurrentCompleted: {
      backgroundColor: theme.text,
      borderWidth: 0,
    },
    // Leading check pinned to the front of a completed month tile.
    monthTileCheck: {
      position: 'absolute',
      left: 12,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
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
