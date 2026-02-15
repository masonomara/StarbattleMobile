import { useUserStore } from '../stores/userStore';
import type { CellValue, Progress } from '../types/state';
import type { Puzzle } from '../types/puzzle';

export function persistProgress(
  puzzle: Puzzle | null,
  cells: CellValue[],
  autoMarks: Set<number>,
  timeMs: number,
  completed: boolean,
  justCompleted: boolean,
): void {
  if (!puzzle) return;
  const progress: Progress = {
    puzzleId: puzzle.id,
    cells,
    autoMarks: [...autoMarks],
    timeMs,
    completed,
    updatedAt: Date.now(),
    ...(justCompleted ? { completedAt: Date.now() } : {}),
  };
  useUserStore.getState().saveProgress(progress);
}
