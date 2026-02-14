import introData from '../packs/intro.json';
import fiveStar from '../packs/1star-5x5.json';
import sixStar from '../packs/1star-6x6.json';
import eightStar from '../packs/1star-8x8.json';
import tenStar from '../packs/2star-10x10.json';
import type { Pack } from './types/puzzle';

// Static for now — will be replaced with async cloud fetches
const PACKS: Pack[] = [
  introData as Pack,
  fiveStar as Pack,
  sixStar as Pack,
  eightStar as Pack,
  tenStar as Pack,
];

export function getAllPacks(): Pack[] {
  return PACKS;
}

export function getPack(id: string): Pack | undefined {
  return PACKS.find(p => p.id === id);
}

export function getPuzzle(packId: string, index: number) {
  return getPack(packId)?.puzzles[index];
}
