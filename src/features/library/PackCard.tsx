import { View, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../../shared/ui/Text';
import { PuzzleThumbnail } from './PuzzleThumbnail';
import { PulseBox, PulseLine } from '../../shared/ui/Pulse';
import Lock from 'lucide-react-native/dist/cjs/icons/lock';
import Check from 'lucide-react-native/dist/cjs/icons/check';
import type { PackCardProps, PackCardSkeletonProps, Theme } from '../../types';

const THUMB_SIZE = 48;

export function PackCard({
  name,
  meta,
  preview,
  onPress,
  right,
  locked = false,
  completed,
  total,
  theme,
  coloredRegions,
  disabled = false,
}: PackCardProps) {
  const { t } = useTranslation();
  const styles = createStyles(theme);

  const isComplete = total != null && total > 0 && completed === total;
  // Fold solve progress into the subtitle, e.g. "1-star · 60/90" via the
  // library.packMeta key. `meta` arrives already-localized (the star string, or
  // "Coming soon" from StreaksModal).
  const subtitle =
    !locked && total != null
      ? t('library.packMeta', { star: meta, completed: completed ?? 0, total })
      : meta;
  const rightNode =
    right ??
    (locked ? (
      <Lock size={19} color={theme.textSecondary} strokeWidth={2.5} />
    ) : isComplete ? (
      <Check size={14} color={theme.green} strokeWidth={3} />
    ) : null);

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
            regionBorderTarget={2.1}
            regionBorderCapFrac={0.15}
            regionBorderMin={0.9}
            gridLineTarget={0.7}
            gridLineCapFrac={0.05}
            gridLineMin={0.3}
          />
        </View>
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]} />
      )}
      <View style={styles.info}>
        <Text role="body" style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text role="body" style={styles.metaText}>
          {subtitle}
        </Text>
      </View>
      {rightNode && <View style={styles.right}>{rightNode}</View>}
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
        {/* Matches the real card's two body lines; dims track the type scale. */}
        <PulseLine role="body" width={110} baseColor={theme.border} />
        {/* body meta line, butted under the name like the real card. */}
        <PulseLine role="body" width={56} baseColor={theme.border} />
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
      padding: 18,
      height: 84,
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
    // Static, non-animated fallback for cards that legitimately have no preview
    // (e.g. StreaksModal's "Coming soon" archive tiles). Loading states use a
    // full PackCardSkeleton at the call site, not this.
    thumbPlaceholder: {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      backgroundColor: theme.border,
    },
    info: {
      flex: 1,
      gap: 3,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
    },
    name: {
      color: theme.text,
      fontWeight: '600',
    },
    metaText: {
      color: theme.textSecondary,
    },
    right: {
      marginLeft: 12,
      flexShrink: 0,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
  });
