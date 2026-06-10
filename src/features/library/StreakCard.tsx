import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../shared/ui/Text';
import { PuzzleThumbnail } from './PuzzleThumbnail';
import { PulseBox } from '../../shared/ui/Pulse';
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
      <PulseBox
        width={size}
        height={size}
        radius={5}
        baseColor={theme.border}
      />
      <PulseBox
        width={120}
        height={36}
        radius={5}
        baseColor={theme.border}
        style={styles.label}
      />
      <PulseBox width={110} height={22} radius={5} baseColor={theme.border} />
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
