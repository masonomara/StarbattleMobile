import React, { memo } from 'react';
import Svg, { Path } from 'react-native-svg';

type Props = {
  size: number;
  color: string;
};

const STAR_PATH =
  'M36 2.18L44.47 25.1H68.76L49.14 39.9L57.62 62.82L36 48.02L14.38 62.82L22.86 39.9L3.24 25.1H27.53Z';

export const StarIcon = memo(function StarIcon({ size, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72">
      <Path d={STAR_PATH} fill={color} />
    </Svg>
  );
});
