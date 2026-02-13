import introData from '../packs/intro.json';
import fiveData from '../packs/1star-5x5.json';
import sixData from '../packs/1star-6x6.json';
import eightData from '../packs/1star-8x8.json';
import tenData from '../packs/2star-10x10.json';
import { parsePuzzle } from './puzzle-parser';
import type { Pack } from './types';

function loadPack(raw: unknown): Pack {
  const data = raw as {
    id: string;
    name: string;
    gridSize: number;
    stars: number;
    puzzles: {
      sbn: string;
      solution: [number, number][];
      hints: { rule: string; level: number; placements: [number, number][]; marks: [number, number][] }[];
    }[];
  };
  return {
    id: data.id,
    name: data.name,
    gridSize: data.gridSize,
    stars: data.stars,
    puzzles: data.puzzles.map((p, i) => parsePuzzle(p, `${data.id}:${i}`)),
  };
}

const PACKS: Pack[] = [
  loadPack(introData),
  loadPack(fiveData),
  loadPack(sixData),
  loadPack(eightData),
  loadPack(tenData),
];

export function getAllPacks(): Pack[] {
  return PACKS;
}

export function getPack(id: string): Pack | undefined {
  return PACKS.find(p => p.id === id);
}
