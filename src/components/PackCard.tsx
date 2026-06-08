import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';
import { PuzzleThumbnail } from './PuzzleThumbnail';
import { PulseBox } from './Pulse';
import type { PackCardProps, PackCardSkeletonProps, Theme } from '../types';

const THUMB_SIZE = 80;

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
            size={THUMB_SIZE}
            theme={theme}
            coloredRegions={coloredRegions}
          />
        </View>
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]} />
      )}
      <View style={styles.info}>
        <Text role="callout" style={styles.name}>{name}</Text>
        <Text role="subhead" style={styles.metaText}>{meta}</Text>
      </View>
      {right && <View style={styles.right}>{right}</View>}
    </Pressable>
  );
}

// Full-card placeholder shown while a library pack isn't ready to render whole
// (catalog not yet synced, or its preview still loading): pulsing thumbnail plus
// two pulsing text bars, sized to PackCard's own layout so the list height is
// stable when the real card drops in all at once.
export function PackCardSkeleton({ theme }: PackCardSkeletonProps) {
  const styles = createStyles(theme);
  return (
    <View style={styles.card}>
      <View style={styles.thumb}>
        <PulseBox
          width={THUMB_SIZE}
          height={THUMB_SIZE}
          radius={0}
          baseColor={theme.border}
        />
      </View>
      <View style={styles.info}>
        <PulseBox width={90} height={17} radius={2} baseColor={theme.border} />
        <PulseBox
          width={45}
          height={17}
          radius={2}
          baseColor={theme.border}
          style={styles.skeletonMeta}
        />
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      // padding: 16,
      borderRadius: 4,
      marginBottom: 20,
      backgroundColor: theme.background,
      // borderWidth: 1,
      // borderColor: theme.border,
    },
    cardDisabled: {
      opacity: 0.4,
    },
    thumb: {
      marginRight: 14,
    },
    // Static, non-animated fallback for cards that legitimately have no preview
    // (e.g. StreaksModal's "Coming soon" archive tiles). Loading states use a
    // full PackCardSkeleton at the call site, not this.
    thumbPlaceholder: {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      backgroundColor: theme.border,
    },
    info: { flex: 1 },
    skeletonMeta: { marginTop: 4 },
    name: {
      color: theme.text,
    },
    metaText: {
      color: theme.textSecondary,
    },
    right: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 28,
      width: 28,
    },
  });
