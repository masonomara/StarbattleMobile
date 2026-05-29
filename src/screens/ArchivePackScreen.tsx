import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Text } from '../components/Text';
import { Header } from '../components/Header';
import ChevronRight from 'lucide-react-native/dist/cjs/icons/chevron-right';
import X from 'lucide-react-native/dist/cjs/icons/x';
import Check from 'lucide-react-native/dist/cjs/icons/check';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../hooks/useTheme';
import { getPastArchive, loadAllCompletionData } from '../utils/progress';
import {
  getCurrentKey,
  STREAK_LABELS,
  formatArchiveKey,
} from '../utils/streakDate';
import { useEntitlementsStore } from '../stores/entitlementsStore';
import type { RootStackParamList, StreakType, Theme } from '../types';

type ArchiveEntry = { dateKey: string; puzzleId: string };

export function ArchivePackScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ArchivePack'>) {
  const { type } = route.params;
  const theme = useTheme();
  const styles = createStyles(theme);

  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [archive, allCompleted] = await Promise.all([
      getPastArchive(type, getCurrentKey(type)),
      loadAllCompletionData(),
    ]);
    setEntries(archive);
    setCompletedIds(allCompleted);
    setLoading(false);
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  const navigateToPuzzle = useCallback(
    (dateKey: string) => {
      const catalog = useEntitlementsStore.getState().packCatalog;
      const packId = catalog.find(p => p.type === type)?.id ?? type;
      navigation.navigate('Puzzle', { packId, archiveKey: dateKey });
    },
    [navigation, type],
  );

  const renderItem = ({ item }: { item: ArchiveEntry }) => {
    const archivePuzzleId = `${type}:archive:${item.dateKey}`;
    const isCompleted = completedIds.has(archivePuzzleId);
    return (
      <Pressable
        style={styles.row}
        onPress={() => navigateToPuzzle(item.dateKey)}
      >
        <Text style={styles.dateText}>
          {formatArchiveKey(type, item.dateKey)}
        </Text>
        <View style={styles.rowRight}>
          {isCompleted && (
            <Check size={16} color={theme.green} strokeWidth={2.5} />
          )}
          <ChevronRight size={18} color={theme.textSecondary} />
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <Header
        absolute={false}
        center={
          <Text style={styles.headerTitle}>
            Past {STREAK_LABELS[type]} Puzzles
          </Text>
        }
        right={
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <X size={24} color={theme.text} />
          </Pressable>
        }
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.textSecondary} />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No past puzzles yet.</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={item => item.dateKey}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    headerTitle: {
      fontSize: theme.fontSizeBody,
      fontWeight: theme.fontWeightSemibold,
      color: theme.text,
    },
    listContent: {
      paddingHorizontal: theme.spacingXl,
      paddingBottom: theme.spacingXl,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: theme.spacingLg,
      paddingHorizontal: theme.spacingXl,
      borderRadius: theme.radiusMd,
      backgroundColor: theme.background,
      marginBottom: theme.spacingMd,
      borderWidth: 1,
      borderColor: theme.border,
    },
    dateText: {
      fontSize: theme.fontSizeCallout,
      color: theme.text,
    },
    rowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    loadingWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyText: {
      fontSize: theme.fontSizeCallout,
      color: theme.textSecondary,
    },
  });
