import { View, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../../shared/ui/Text';
import { PuzzleThumbnail } from './PuzzleThumbnail';
import { PulseBox, PulseLine } from '../../shared/ui/Pulse';
import type {
  StreakCardProps,
  StreakCardSkeletonProps,
  StreakCardStatus,
  Theme,
} from '../../types';

// `as const` keeps the values as literal key types (not widened to string) so
// t(STATUS_KEY[status]) stays type-checked; `satisfies` enforces full coverage.
const STATUS_KEY = {
  'not-started': 'library.streakStatusNotStarted',
  'in-progress': 'library.streakStatusInProgress',
  complete: 'library.streakStatusComplete',
} as const satisfies Record<StreakCardStatus, string>;

// A streak carousel card: thumbnail, the fully-composed challenge title (passed in
// as `label`, e.g. "Daily Challenge"), and a meta line of "<n>-star • <status>".
export function StreakCard({
  label,
  starCount,
  status,
  preview,
  size,
  theme,
  coloredRegions,
  onPress,
  testID,
}: StreakCardProps) {
  const { t } = useTranslation();
  const styles = createStyles(theme);
  return (
    <Pressable testID={testID} style={styles.card} onPress={onPress}>
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
        {label}
      </Text>
      <Text role="body" style={styles.meta}>
        {t('home.packStar', { count: starCount })}&nbsp;·&nbsp;
        {t(STATUS_KEY[status])}
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
      {/* Matches the real card's title1 + body lines; dims track the type scale. */}
      <PulseLine
        role="title1"
        width={210}
        radius={6}
        baseColor={theme.border}
        style={styles.label}
      />
      {/* body meta line, butted directly under the title (no gap). */}
      <PulseLine role="body" width={140} radius={4} baseColor={theme.border} />
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      justifyContent: 'flex-start',
      padding: 18,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
    },
    label: {
      color: theme.text,
      marginTop: 12,
      marginBottom: 3,
    },
    meta: {
      color: theme.textSecondary,
    },
  });
