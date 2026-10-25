// Sudoku generator: fill a random solved grid, then dig out cells one by one,
// keeping each removal only if the puzzle still has exactly one solution.
// Grids are flat arrays of 81 numbers, 0 = empty.

export type Difficulty = "easy" | "medium" | "hard" | "expert";

export const DIFFICULTIES: { id: Difficulty; label: string; clues: number }[] = [
  { id: "easy", label: "Easy", clues: 40 },
  { id: "medium", label: "Medium", clues: 33 },
  { id: "hard", label: "Hard", clues: 28 },
  { id: "expert", label: "Expert", clues: 23 },
];

const ALL = 0x3fe; // bits 1..9

export const rowOf = (i: number) => Math.floor(i / 9);
export const colOf = (i: number) => i % 9;
export const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

// Indices sharing a row, column or box with each cell.
export const PEERS: number[][] = Array.from({ length: 81 }, (_, i) =>
  Array.from({ length: 81 }, (_, j) => j).filter((j) => j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i))),
);

function shuffle<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function digitsOf(mask: number) {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << d)) out.push(d);
  return out;
}

// Backtracking search with "fewest candidates first". Stops after `limit` solutions.
function search(grid: number[], limit: number, randomize: boolean): { count: number; solution: number[] | null } {
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = grid[i];
    if (!v) continue;
    const bit = 1 << v;
    if ((rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]) & bit) return { count: 0, solution: null };
    rows[rowOf(i)] |= bit;
    cols[colOf(i)] |= bit;
    boxes[boxOf(i)] |= bit;
  }
  const cells = grid.slice();
  let count = 0;
  let solution: number[] | null = null;

  const step = (): boolean => {
    let best = -1;
    let bestMask = 0;
    let bestSize = 10;
    for (let i = 0; i < 81; i++) {
      if (cells[i]) continue;
      const mask = ALL & ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]);
      const size = digitsOf(mask).length;
      if (size < bestSize) {
        best = i;
        bestMask = mask;
        bestSize = size;
        if (size <= 1) break;
      }
    }
    if (best === -1) {
      count++;
      if (!solution) solution = cells.slice();
      return count >= limit;
    }
    const candidates = digitsOf(bestMask);
    for (const d of randomize ? shuffle(candidates) : candidates) {
      const bit = 1 << d;
      const r = rowOf(best), c = colOf(best), b = boxOf(best);
      cells[best] = d;
      rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
      if (step()) return true;
      rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
      cells[best] = 0;
    }
    return false;
  };

  step();
  return { count, solution };
}

export function solve(grid: number[]) {
  return search(grid, 1, false).solution;
}

export function generate(difficulty: Difficulty) {
  const target = DIFFICULTIES.find((d) => d.id === difficulty)?.clues ?? 33;
  const solution = search(new Array(81).fill(0), 1, true).solution!;
  const puzzle = solution.slice();
  let clues = 81;
  for (const i of shuffle(Array.from({ length: 81 }, (_, k) => k))) {
    if (clues <= target) break;
    const kept = puzzle[i];
    puzzle[i] = 0;
    if (search(puzzle, 2, false).count === 1) clues--;
    else puzzle[i] = kept;
  }
  return { puzzle, solution };
}
