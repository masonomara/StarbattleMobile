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
import { loadAllCompletionData } from '../utils/progress';
import { getPastDateKeys, STREAK_LABELS, formatArchiveKey } from '../utils/streakDate';
import { useEntitlementsStore } from '../stores/entitlementsStore';
import type { RootStackParamList, StreakType, Theme } from '../types';

export function ArchivePackScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ArchivePack'>) {
  const { type } = route.params;
  const theme = useTheme();
  const styles = createStyles(theme);

  const dateKeys = getPastDateKeys(type);

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
      const packId = catalog.find(p => p.type === type)?.id ?? type;
      navigation.navigate('Puzzle', { packId, archiveKey: dateKey });
    },
    [navigation, type],
  );

  const renderItem = ({ item }: { item: string }) => {
    const isCompleted = completedIds.has(`${type}:archive:${item}`);
    return (
      <Pressable style={styles.row} onPress={() => navigateToPuzzle(item)}>
        <Text style={styles.dateText}>{formatArchiveKey(type, item)}</Text>
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
        <View style={styles.centerWrap}>
          <ActivityIndicator color={theme.textSecondary} />
        </View>
      ) : (
        <FlatList
          data={dateKeys}
          keyExtractor={item => item}
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
    centerWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
