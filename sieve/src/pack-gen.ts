import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { solve, StepInfo } from "./solver";
import { REGION_LETTERS } from "./helpers/notation";
import { computeDifficulty } from "./helpers/difficulty";
import { sieve } from "./sieve";
import { Board, CellState, Coord, Puzzle } from "./helpers/types";

// ── Types matching GEN-types.md ─────────────────────────────────────

type HintStep = {
  rule: string;
  level: number;
  placements: Coord[];
  marks: Coord[];
};

type BundledPuzzle = {
  sbn: string;
  solution: Coord[];
  hints: HintStep[];
};

type PackFile = {
  id: string;
  name: string;
  version: number;
  free: boolean;
  gridSize: number;
  stars: number;
  puzzles: BundledPuzzle[];
};

type PackConfig = {
  id: string;
  name: string;
  gridSize: number;
  stars: number;
  count: number;
  free: boolean;
};

// ── Helpers ─────────────────────────────────────────────────────────

function diffBoards(
  prev: CellState[][] | null,
  curr: CellState[][],
  size: number,
): { placements: Coord[]; marks: Coord[] } {
  const placements: Coord[] = [];
  const marks: Coord[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const prevState = prev ? prev[r][c] : "unknown";
      const currState = curr[r][c];
      if (prevState === "unknown" && currState === "star") {
        placements.push([r, c]);
      } else if (prevState === "unknown" && currState === "marked") {
        marks.push([r, c]);
      }
    }
  }
  return { placements, marks };
}

function extractStars(cells: CellState[][]): Coord[] {
  const stars: Coord[] = [];
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      if (cells[r][c] === "star") stars.push([r, c]);
    }
  }
  return stars;
}

function encodeSbn(
  board: Board,
  seed: number,
  difficulty: number,
  maxLevel: number,
  cycles: number,
): string {
  const size = board.grid.length;
  let layout = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      layout += REGION_LETTERS[board.grid[r][c]];
    }
  }
  return `${size}x${board.stars}.${layout}.s${seed}d${difficulty}l${maxLevel}c${cycles}`;
}

// ── Core ────────────────────────────────────────────────────────────

function tracePuzzle(puzzle: Puzzle): BundledPuzzle | null {
  const { board } = puzzle;
  const size = board.grid.length;
  const hints: HintStep[] = [];
  let prevCells: CellState[][] | null = null;

  const result = solve(board, {
    onStep: (step: StepInfo) => {
      const { placements, marks } = diffBoards(prevCells, step.cells, size);
      hints.push({ rule: step.rule, level: step.level, placements, marks });
      prevCells = step.cells.map((row) => [...row]);
    },
  });

  if (!result) return null;

  const difficulty = computeDifficulty(result);
  const solution = extractStars(result.cells);
  const sbn = encodeSbn(board, puzzle.seed, difficulty, result.maxLevel, result.cycles);
  return { sbn, solution, hints };
}

function generatePack(config: PackConfig): PackFile {
  console.log(`  ${config.id}: generating ${config.count} ${config.gridSize}\u00D7${config.gridSize} ${config.stars}-star puzzles...`);

  const puzzles = sieve({
    size: config.gridSize,
    stars: config.stars,
    count: config.count,
    onProgress: (solved, attempts) => {
      if (attempts % 100 === 0 || solved === config.count) {
        process.stdout.write(`\r    ${solved}/${config.count} generated`);
      }
    },
  });
  process.stdout.write(`\r    ${puzzles.length}/${config.count} generated\n`);

  const bundled: BundledPuzzle[] = [];
  for (const puzzle of puzzles) {
    const result = tracePuzzle(puzzle);
    if (result) bundled.push(result);
  }

  // Sort by difficulty within the pack
  bundled.sort((a, b) => {
    const dA = parseInt(a.sbn.split("d")[1], 10);
    const dB = parseInt(b.sbn.split("d")[1], 10);
    return dA - dB;
  });

  return {
    id: config.id,
    name: config.name,
    version: 1,
    free: config.free,
    gridSize: config.gridSize,
    stars: config.stars,
    puzzles: bundled,
  };
}

function generateIntroPack(count: number): PackFile {
  const perSize = Math.ceil(count / 3);
  console.log(`  intro: generating ${perSize} each of 5\u00D75, 6\u00D76, 8\u00D78 (1-star)...`);

  const allBundled: BundledPuzzle[] = [];

  for (const gridSize of [5, 6, 8]) {
    const puzzles = sieve({ size: gridSize, stars: 1, count: perSize });
    process.stdout.write(`    ${gridSize}\u00D7${gridSize}: ${puzzles.length} generated\n`);
    for (const puzzle of puzzles) {
      const result = tracePuzzle(puzzle);
      if (result) allBundled.push(result);
    }
  }

  // Sort: all 5×5 first (by difficulty), then 6×6, then 8×8
  allBundled.sort((a, b) => {
    const sizeA = parseInt(a.sbn.split("x")[0], 10);
    const sizeB = parseInt(b.sbn.split("x")[0], 10);
    if (sizeA !== sizeB) return sizeA - sizeB;
    const dA = parseInt(a.sbn.split("d")[1], 10);
    const dB = parseInt(b.sbn.split("d")[1], 10);
    return dA - dB;
  });

  // Trim to requested count
  const puzzles = allBundled.slice(0, count);

  return {
    id: "intro",
    name: "Intro Pack",
    version: 1,
    free: true,
    gridSize: 5, // smallest in pack
    stars: 1,
    puzzles,
  };
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.resolve(__dirname, "../../packs");
  const count = 30;

  const configs: PackConfig[] = [
    { id: "1star-5x5", name: "1-Star 5\u00D75", gridSize: 5, stars: 1, count, free: true },
    { id: "1star-6x6", name: "1-Star 6\u00D76", gridSize: 6, stars: 1, count, free: true },
    { id: "1star-8x8", name: "1-Star 8\u00D78", gridSize: 8, stars: 1, count, free: true },
    { id: "2star-10x10", name: "2-Star 10\u00D710", gridSize: 10, stars: 2, count, free: true },
  ];

  console.log(`Generating ${configs.length + 1} packs (${count} puzzles each)\n`);

  const startTime = Date.now();
  const packs: PackFile[] = [];

  // Intro pack (mixed sizes)
  packs.push(generateIntroPack(count));

  // Standard packs
  for (const config of configs) {
    packs.push(generatePack(config));
  }

  // Write output
  fs.mkdirSync(outDir, { recursive: true });

  console.log("\nOutput:");
  for (const pack of packs) {
    const json = JSON.stringify(pack);
    const filePath = path.join(outDir, `${pack.id}.json`);
    fs.writeFileSync(filePath, json);
    const sizeKB = (Buffer.byteLength(json) / 1024).toFixed(1);
    console.log(`  ${pack.id}.json: ${pack.puzzles.length} puzzles, ${sizeKB} KB`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s → ${outDir}/`);
}

main();
