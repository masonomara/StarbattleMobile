import type { ViewStyle } from 'react-native';

// Spacing scale
export const SPACING_XS = 4;
export const SPACING_SM = 6;
export const SPACING_MD = 12;
export const SPACING_LG = 16;
export const SPACING_XL = 24;
export const SPACING_XXL = 48;

// Border radii
export const RADIUS_SM = 8;
export const RADIUS_MD = 12;
export const RADIUS_LG = 24;

// Font sizes
export const FONT_SIZE_SM = 14;
export const FONT_SIZE_MD = 16;
export const FONT_SIZE_LG = 18;
export const FONT_SIZE_XL = 34;

// Font weights
export const FONT_WEIGHT_SEMIBOLD = '600' as const;
export const FONT_WEIGHT_BOLD = '700' as const;

// Pack grid
export const GRID_COLUMNS = 5;

// Win banner
export const WIN_BANNER_SLIDE_DISTANCE = 200;

// Opacity
export const DISABLED_OPACITY = 0.3;

// Shadow presets
export const SHADOW_SM: ViewStyle = {
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 2,
  elevation: 1,
};

export const SHADOW_MD: ViewStyle = {
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 4,
  elevation: 2,
};

// Cell dimensions
export const CELL_SIZE = 32;

// Border widths
export const REGION_BORDER_WIDTH = 3;
export const INNER_BORDER_WIDTH = 0.5;

// Star icon
export const STAR_ICON_SIZE = 22;

// Mark (X) icon
export const MARK_ICON_SIZE = 14;

// Pinch-to-zoom limits
export const DEFAULT_ZOOM = 1;
export const MIN_ZOOM = 0.67;
export const MAX_ZOOM = 3;

// Pan bounds
export const PAN_PADDING = 30;
