import { create } from 'zustand';

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
