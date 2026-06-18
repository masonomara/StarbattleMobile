import { getViolation } from '../puzzleLogic';
import i18n from '../../../shared/lib/i18n';
import type { CellValue, Puzzle } from '../../../types';

// The tutorial's contextual header line for the current board: a rule-specific
// error message when something's wrong, otherwise the next bit of guidance.
// Not a React component, so it reads from the i18n instance directly rather than
// the useTranslation hook.
export function tutorialMessage(cells: CellValue[], puzzle: Puzzle): string {
  const kind = getViolation(cells, puzzle.size, puzzle);
  if (kind === 'adjacency') return i18n.t('tutorial.adjacency');
  if (kind === 'row') return i18n.t('tutorial.row');
  if (kind === 'column') return i18n.t('tutorial.column');
  if (kind === 'region') return i18n.t('tutorial.region');
  if (cells.every(c => c !== 1)) {
    return cells.some(c => c === 2)
      ? i18n.t('tutorial.convertMark')
      : i18n.t('tutorial.start');
  }
  return i18n.t('tutorial.keepGoing');
}
