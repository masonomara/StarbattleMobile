import { Colors } from '../constants/theme';

export type ThemeColors = {
  [K in keyof (typeof Colors)['light']]: string;
};
