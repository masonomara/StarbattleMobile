import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../components/Text';
import ChevronLeft from 'lucide-react-native/dist/cjs/icons/chevron-left';
import Check from 'lucide-react-native/dist/cjs/icons/check';
import { CircleButton } from '../components/CircleButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../hooks/useTheme';
import { loadAllCompletionData } from '../utils/progress';
import { getPastDateKeys, STREAK_LABELS, formatArchiveKey } from '../utils/streakDate';
import { useEntitlementsStore } from '../stores/entitlementsStore';
import type { RootStackParamList, Theme } from '../types';
import { SCREEN_HEADER_HEIGHT } from '../layout';

const NUM_COLS = 2;

export function ArchivePackScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ArchivePack'>) {
  const { type } = route.params;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cellSize = Math.floor((width - 2 * 32 - NUM_COLS * 12) / NUM_COLS);
  const styles = useMemo(
    () => createStyles(theme, cellSize, insets),
    [theme, cellSize, insets],
  );

  const dateKeys = getPastDateKeys(type);

  const [scrolled, setScrolled] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllCompletionData().then(ids => {
      setCompletedIds(ids);
      setLoading(false);
    });
  }, []);

  const navigateToPuzzle = useCallback(
    (dateKey: string) => {
      const catalog = useEntitlementsStore.getState().packCatalog;
      const packId = catalog.find(p => p.type === type)?.id;
      if (!packId) return;
      navigation.navigate('Puzzle', { packId, archiveKey: dateKey });
    },
    [navigation, type],
  );

  const rows = useMemo(() => {
    const result: string[][] = [];
    for (let i = 0; i < dateKeys.length; i += NUM_COLS) {
      result.push(dateKeys.slice(i, i + NUM_COLS));
    }
    return result;
  }, [dateKeys]);

  const renderRow = useCallback(
    ({ item: rowKeys }: { item: string[] }) => (
      <View style={styles.row}>
        {rowKeys.map(dateKey => {
          const isCompleted = completedIds.has(`${type}:archive:${dateKey}`);
          return (
            <Pressable
              key={dateKey}
              style={styles.cell}
              onPress={() => navigateToPuzzle(dateKey)}
            >
              {isCompleted && (
                <View style={styles.checkOverlay}>
                  <Check size={22} color={theme.blue} strokeWidth={2.5} />
                </View>
              )}
              <Text style={styles.dateText}>
                {formatArchiveKey(type, dateKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    ),
    [completedIds, type, navigateToPuzzle, styles, theme],
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={StyleSheet.absoluteFill} color={theme.textSecondary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top },
          scrolled && styles.headerBorder,
        ]}
      >
        <CircleButton ghost onPress={() => navigation.goBack()}>
          <ChevronLeft size={26} strokeWidth={2} color={theme.text} />
        </CircleButton>
        <Text style={styles.headerTitle}>
          Past {STREAK_LABELS[type]} Puzzles
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={item => item[0]}
        renderItem={renderRow}
        style={styles.scroll}
        onScroll={e => setScrolled(e.nativeEvent.contentOffset.y > 0)}
        scrollEventThrottle={16}
        contentContainerStyle={styles.gridContent}
      />
    </View>
  );
}

const createStyles = (
  theme: Theme,
  cellSize: number,
  insets: { top: number; bottom: number },
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
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
      backgroundColor: theme.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.background,
    },
    headerBorder: {
      borderBottomColor: theme.border,
    },
    headerSpacer: {
      width: 44,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.text,
    },
    scroll: { flex: 1 },
    gridContent: {
      paddingHorizontal: 32,
      paddingTop: SCREEN_HEADER_HEIGHT + insets.top + 24,
      paddingBottom: insets.bottom + 24,
      rowGap: 12,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'center',
    },
    cell: {
      height: cellSize,
      width: cellSize,
      margin: 8,
      backgroundColor: theme.surface,
      borderRadius: theme.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
    },
    checkOverlay: {
      position: 'absolute',
      top: 10,
      right: 10,
    },
    dateText: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.text,
      textAlign: 'center',
    },
  });
