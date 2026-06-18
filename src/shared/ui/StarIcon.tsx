import React, { useMemo } from 'react';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import type { StarIconProps } from '../../types';

// The exact 5-pointed star vector the puzzle board draws (see PuzzleCanvas
// dynamicPaths): a 10-vertex polygon alternating outer/inner radius at a 0.44
// ratio, top spike up (-π/2 start). Kept geometrically identical so the header
// chip reads as the same star players place on the board.
export function StarIcon({ size, color }: StarIconProps) {
  const path = useMemo(() => {
    const outerR = size / 2;
    const innerR = outerR * 0.44;
    const c = size / 2;
    const b = Skia.PathBuilder.Make();
    for (let p = 0; p < 10; p++) {
      const angle = (p * Math.PI) / 5 - Math.PI / 2;
      const rad = p % 2 === 0 ? outerR : innerR;
      const x = c + Math.cos(angle) * rad;
      const y = c + Math.sin(angle) * rad;
      if (p === 0) b.moveTo(x, y);
      else b.lineTo(x, y);
    }
    b.close();
    return b.detach();
  }, [size]);

  return (
    <Canvas style={{ width: size, height: size }}>
      <Path path={path} color={color} />
    </Canvas>
  );
}
