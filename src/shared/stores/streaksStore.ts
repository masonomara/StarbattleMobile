import { create } from 'zustand';

// This store manages only the streak modal's visibility.
// Actual streak data (current count, last completed key) lives in PowerSync
// and is accessed via the useStreakRows hook — not here.
type StreaksState = {
  streaksModalVisible: boolean;
  openStreaks: () => void;
  closeStreaks: () => void;
};

export const useStreaksStore = create<StreaksState>(set => ({
  streaksModalVisible: false,
  openStreaks: () => set({ streaksModalVisible: true }),
  closeStreaks: () => set({ streaksModalVisible: false }),
}));
