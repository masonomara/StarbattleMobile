import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';
import { PuzzleThumbnail } from './PuzzleThumbnail';
import type { PackCardProps, Theme } from '../types';

export function PackCard({
  name,
  meta,
  preview,
  onPress,
  right,
  theme,
  coloredRegions,
  disabled = false,
}: PackCardProps) {
  const styles = createStyles(theme);
  return (
    <Pressable
      style={[styles.card, disabled && styles.cardDisabled]}
      onPress={disabled ? undefined : onPress}
    >
      {preview ? (
        <View style={styles.thumb}>
          <PuzzleThumbnail
            puzzle={preview}
            size={48}
            theme={theme}
            coloredRegions={coloredRegions}
          />
        </View>
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]} />
      )}
      <View style={styles.info}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.metaText}>{meta}</Text>
      </View>
      {right && <View style={styles.right}>{right}</View>}
    </Pressable>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderRadius: 4,
      marginBottom: 12,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cardDisabled: {
      opacity: 0.4,
    },
    thumb: {
      marginRight: 14,
    },
    thumbPlaceholder: {
      width: 48,
      height: 48,
      borderRadius: 4,
      backgroundColor: theme.border,
    },
    info: { flex: 1 },
    name: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '700',
      color: theme.text,
      letterSpacing: -0.56,
    },
    metaText: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '500',
      color: theme.textSecondary,
      letterSpacing: -0.56,
      marginTop: 2,
    },
    right: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 28,
      width: 28,
    }
  });
