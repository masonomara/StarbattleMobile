import introData from '../packs/intro.json';
import fiveStar from '../packs/1star-5x5.json';
import sixStar from '../packs/1star-6x6.json';
import eightStar from '../packs/1star-8x8.json';
import tenStar from '../packs/2star-10x10.json';
import type { Pack } from './types/puzzle';

// Static for now — will be replaced with async cloud fetches
const PACKS: Pack[] = [
  introData as unknown as Pack,
  fiveStar as unknown as Pack,
  sixStar as unknown as Pack,
  eightStar as unknown as Pack,
  tenStar as unknown as Pack,
];

export function getAllPacks(): Pack[] {
  return PACKS;
}

export function getPack(id: string): Pack | undefined {
  return PACKS.find(p => p.id === id);
}
