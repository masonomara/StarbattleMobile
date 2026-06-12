import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../../shared/ui/Text';
import X from 'lucide-react-native/dist/cjs/icons/x';
import Check from 'lucide-react-native/dist/cjs/icons/check';
import Lock from 'lucide-react-native/dist/cjs/icons/lock';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../shared/theme/useTheme';
import { loadAllCompletionData } from '../../shared/lib/progress';
import {
  getActiveStreak,
  getCurrentKey,
  getPastDateKeys,
  formatArchiveKey,
  capitalize,
  RELEASE_DATE,
  STREAK_UNIT_KEY,
} from '../../shared/lib/streakDate';
import { useEntitlementsStore } from '../../shared/stores/entitlementsStore';
import { useSettingsStore } from '../../shared/stores/settingsStore';
import { useAuthStore } from '../../shared/stores/authStore';
import { useEntitlements } from '../../shared/hooks/useEntitlements';
import { useStreakRows } from '../../shared/hooks/useStreakRows';
import type { RootStackParamList, StreakType, Theme } from '../../types';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// One horizontal page of the daily calendar.
type MonthPage = { year: number; month: number };

// All months from launch through the current month, oldest first. The daily
// calendar pages through these left-to-right, opening on the latest.
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

  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
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
          <DailyCalendar
            width={width}
            keySet={keySet}
            isCompleted={isCompleted}
            onPress={onChallengePress}
            theme={theme}
          />
        ) : (
          <ChallengeStrip
            type={type}
            dateKeys={dateKeys}
            isCompleted={isCompleted}
            onPress={onChallengePress}
            theme={theme}
          />
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
  styles: ReturnType<typeof createStyles>;
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

// ── Daily calendar ───────────────────────────────────────────────────────────
// Month grids paged horizontally; opens on the latest month.
function DailyCalendar({
  width,
  keySet,
  isCompleted,
  onPress,
  theme,
}: {
  width: number;
  keySet: Set<string>;
  isCompleted: (k: string) => boolean;
  onPress: (k: string) => void;
  theme: Theme;
}) {
  const pages = useMemo(() => getMonthPages(new Date()), []);
  const todayKey = getCurrentKey('daily');
  const styles = useMemo(
    () => createStyles(theme, { top: 0, bottom: 0 }),
    [theme],
  );
  const cell = Math.floor((width - 2 * 24) / 7);

  const renderPage = useCallback(
    ({ item }: { item: MonthPage }) => (
      <MonthGrid
        page={item}
        width={width}
        cell={cell}
        keySet={keySet}
        todayKey={todayKey}
        isCompleted={isCompleted}
        onPress={onPress}
        theme={theme}
        styles={styles}
      />
    ),
    [width, cell, keySet, todayKey, isCompleted, onPress, theme, styles],
  );

  return (
    <FlatList
      data={pages}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      keyExtractor={p => `${p.year}-${p.month}`}
      renderItem={renderPage}
      initialScrollIndex={pages.length - 1}
      getItemLayout={(_, index) => ({
        length: width,
        offset: width * index,
        index,
      })}
      onScrollToIndexFailed={() => {}}
    />
  );
}

function MonthGrid({
  page,
  width,
  cell,
  keySet,
  todayKey,
  isCompleted,
  onPress,
  theme,
  styles,
}: {
  page: MonthPage;
  width: number;
  cell: number;
  keySet: Set<string>;
  todayKey: string;
  isCompleted: (k: string) => boolean;
  onPress: (k: string) => void;
  theme: Theme;
  styles: ReturnType<typeof createStyles>;
}) {
  const { year, month } = page;
  const title = new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const offset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const slots: (number | null)[] = [];
  for (let i = 0; i < offset; i++) slots.push(null);
  for (let d = 1; d <= daysInMonth; d++) slots.push(d);

  return (
    <View style={[styles.monthPage, { width }]}>
      <Text role="headline" style={styles.monthTitle}>
        {title}
      </Text>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LETTERS.map((letter, i) => (
          <View key={i} style={[styles.weekdayCell, { width: cell }]}>
            <Text role="footnote" style={styles.weekdayLetter}>
              {letter}
            </Text>
          </View>
        ))}
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

// ── Weekly / monthly strip ────────────────────────────────────────────────────
// A horizontal row of challenge cells; opens on the most recent.
function ChallengeStrip({
  type,
  dateKeys,
  isCompleted,
  onPress,
  theme,
}: {
  type: StreakType;
  dateKeys: string[];
  isCompleted: (k: string) => boolean;
  onPress: (k: string) => void;
  theme: Theme;
}) {
  const styles = useMemo(
    () => createStyles(theme, { top: 0, bottom: 0 }),
    [theme],
  );
  // dateKeys arrive newest-first; show oldest-first and open at the end.
  const ordered = useMemo(() => [...dateKeys].reverse(), [dateKeys]);

  const renderCell = useCallback(
    ({ item: dateKey }: { item: string }) => {
      const completed = isCompleted(dateKey);
      return (
        <Pressable style={styles.stripCell} onPress={() => onPress(dateKey)}>
          {completed && (
            <View style={styles.stripCheck}>
              <Check size={18} color={theme.blue} strokeWidth={2.5} />
            </View>
          )}
          <Text role="subhead" style={styles.stripCellText}>
            {formatArchiveKey(type, dateKey)}
          </Text>
        </Pressable>
      );
    },
    [type, isCompleted, onPress, styles, theme],
  );

  return (
    <FlatList
      data={ordered}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={k => k}
      renderItem={renderCell}
      contentContainerStyle={styles.stripContent}
      initialScrollIndex={Math.max(0, ordered.length - 1)}
      getItemLayout={(_, index) => ({
        length: STRIP_CELL_WIDTH + 12,
        offset: (STRIP_CELL_WIDTH + 12) * index,
        index,
      })}
      onScrollToIndexFailed={() => {}}
    />
  );
}

const STRIP_CELL_WIDTH = 150;

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
    // Daily calendar
    monthPage: {
      paddingHorizontal: 24,
      paddingTop: 28,
    },
    monthTitle: {
      color: theme.text,
      textAlign: 'center',
      marginBottom: 16,
    },
    weekdayRow: {
      flexDirection: 'row',
      marginBottom: 8,
    },
    weekdayCell: {
      alignItems: 'center',
    },
    weekdayLetter: {
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
    // Weekly / monthly strip
    stripContent: {
      paddingHorizontal: 24,
      paddingTop: 28,
      gap: 12,
    },
    stripCell: {
      width: STRIP_CELL_WIDTH,
      height: STRIP_CELL_WIDTH,
      backgroundColor: theme.surface,
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
    },
    stripCheck: {
      position: 'absolute',
      top: 10,
      right: 10,
    },
    stripCellText: {
      color: theme.text,
      textAlign: 'center',
    },
  });
