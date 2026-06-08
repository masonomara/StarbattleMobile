import React from 'react';
import { View, StyleSheet } from 'react-native';
import Check from 'lucide-react-native/dist/cjs/icons/check';
import { Text } from './Text';
import type { StreakProgressRowProps, Theme } from '../types';

const CIRCLE = 18;

// Progress row beneath a streak card: one circle per cell (daily → days of the
// week, weekly → weeks of the month, monthly → months of the year). A cell fills
// once its special is solved; the current day/week/month is underlined so it's
// always identifiable, and the connector before a circle lights when both it and
// the previous cell are completed, merging consecutive wins into one bar.
// Pure render from props — cheap (a handful of cells) and always current as
// completions sync in.
export const StreakProgressRow = React.memo(function StreakProgressRow({
  cells,
  completedKeys,
  theme,
}: StreakProgressRowProps) {
  const styles = createStyles(theme);
  const completed = cells.map(c => completedKeys.has(c.key));

  return (
    <View style={styles.row}>
      {cells.map((cell, i) => {
        const isCompleted = completed[i];
        // The gap before this circle fills in when both it and the previous cell
        // are completed, connecting consecutive solved cells into one bar.
        const connectorLit = i > 0 && isCompleted && completed[i - 1];
        return (
          <React.Fragment key={cell.key}>
            {i > 0 && (
              <View style={[styles.spacer, connectorLit && styles.spacerLit]} />
            )}
            <View
              style={[
                styles.circle,
                cell.isCurrent && styles.circleToday,
                isCompleted && styles.circleCompleted,
              ]}
            >
              {isCompleted ? (
                // Solved cells show a check knocked out of the filled circle.
                <Check size={10} color={theme.background} strokeWidth={4} />
              ) : (
                <Text
                  style={[styles.letter, cell.isCurrent && styles.letterToday]}
                >
                  {cell.letter}
                </Text>
              )}
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
});

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 15,
    },
    // Flexible gap between circles — transparent by default, full circle height
    // so that when lit it butts seamlessly against the discs as one bar.
    spacer: {
      width: 22,
      marginLeft: -9,
      marginRight: -9,
      height: 18,
      backgroundColor: 'transparent',
      zIndex: -1,
    },
    spacerLit: {
      backgroundColor: theme.textSecondary,
    },
    circle: {
      width: CIRCLE,
      height: CIRCLE,
      borderRadius: CIRCLE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 0,
      marginRight: 0,
      backgroundColor: theme.background,
      padding: 0,
    },
    circleToday: {
      borderWidth: 1.25,

      borderColor: theme.text,
    },
    circleCompleted: {
      width: CIRCLE,
      height: CIRCLE,
      borderRadius: CIRCLE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0,
      marginLeft: 0,
      backgroundColor: theme.textSecondary,
      marginRight: 0,
    },
    letter: {
      fontSize: 9,
      lineHeight: 15,
      fontWeight: '600',
      color: theme.text,
    },
    letterToday: {
      color: theme.text,
    },
  });
