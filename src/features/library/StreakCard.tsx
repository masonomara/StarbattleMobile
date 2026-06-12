import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../shared/ui/Text';
import { PuzzleThumbnail } from './PuzzleThumbnail';
import { PulseBox, PulseLine } from '../../shared/ui/Pulse';
import type {
  StreakCardProps,
  StreakCardSkeletonProps,
  StreakCardStatus,
  Theme,
} from '../../types';

const STATUS_LABEL: Record<StreakCardStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  complete: 'Complete',
};

// A streak carousel card: thumbnail, "<cadence> Challenge" title, and a meta line
// of "<n> star puzzle • <status>".
export function StreakCard({
  label,
  starCount,
  status,
  preview,
  size,
  theme,
  coloredRegions,
  onPress,
}: StreakCardProps) {
  const styles = createStyles(theme);
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <PuzzleThumbnail
        puzzle={preview}
        size={size}
        theme={theme}
        coloredRegions={coloredRegions}
        regionBorderTarget={3.3}
        regionBorderCapFrac={0.18}
        regionBorderMin={1.5}
        gridLineTarget={1.1}
        gridLineCapFrac={0.06}
        gridLineMin={0.5}
      />
      <Text role="title1" style={styles.label}>
        {`${label} Challenge`}
      </Text>
      <Text role="subhead" style={styles.meta}>
        {`${starCount}-star`}&nbsp;·&nbsp;
        {`${STATUS_LABEL[status]}`}
      </Text>
    </Pressable>
  );
}

// Fixed-size placeholder matching a StreakCard's footprint, so the carousel
// doesn't pop in and shove the library list down while previews load.
export function StreakCardSkeleton({ size, theme }: StreakCardSkeletonProps) {
  const styles = createStyles(theme);
  return (
    <View style={styles.card}>
      {/* Square to match the Skia thumbnail's hard rectangular border (0 radius). */}
      <PulseBox
        width={size}
        height={size}
        radius={0}
        baseColor={theme.border}
      />
      {/* title1 line: 30/37. Bar ≈ cap height, centered in the 37px line box. */}
      <PulseLine
        width={210}
        lineHeight={37}
        barHeight={21}
        radius={6}
        baseColor={theme.border}
        style={styles.label}
      />
      {/* subhead meta line: 15/20, butted directly under the title (no gap). */}
      <PulseLine
        width={140}
        lineHeight={20}
        barHeight={11}
        radius={4}
        baseColor={theme.border}
      />
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      justifyContent: 'flex-start',
    },
    label: {
      color: theme.text,
      marginTop: 10,
    },
    meta: {
      color: theme.textSecondary,
    },
  });
