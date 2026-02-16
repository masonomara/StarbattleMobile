import React, { memo } from 'react';
import Svg, { Line } from 'react-native-svg';

type Props = {
  size: number;
  color: string;
};

export const MarkIcon = memo(function MarkIcon({ size, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line
        x1={6}
        y1={6}
        x2={18}
        y2={18}
        stroke={color}
        strokeWidth={3}
      />
      <Line
        x1={18}
        y1={6}
        x2={6}
        y2={18}
        stroke={color}
        strokeWidth={3}
    
      />
    </Svg>
  );
});
