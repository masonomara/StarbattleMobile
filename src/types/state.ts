export type CellState = 'unknown' | 'marked' | 'star';

export type PuzzleProgress = {
  puzzle_id: string;
  cells: string;
  time_ms: number;
  completed: boolean;
  completed_at?: number;
  hints_used: number;
  current_hint_index: number;
  updated_at: number;
};

export type UserSettings = {
  auto_x: boolean;
  show_timer: boolean;
  theme: 'light' | 'dark';
  haptics: boolean;
  updated_at: number;
};
