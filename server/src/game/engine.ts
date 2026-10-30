export type PlayerColor = "red" | "yellow";
export type Cell = PlayerColor | null;
export type Board = Cell[][];

export const ROWS = 6;
export const COLS = 7;

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
}

export function dropDisc(board: Board, column: number, color: PlayerColor): { board: Board; row: number } | null {
  if (!Number.isInteger(column) || column < 0 || column >= COLS) return null;
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][column] === null) {
      const next = board.map((line) => [...line]);
      next[row][column] = color;
      return { board: next, row };
    }
  }
  return null;
}

export function hasWon(board: Board, color: PlayerColor): boolean {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (board[row][col] !== color) continue;
      for (const [dr, dc] of directions) {
        let count = 1;
        for (let step = 1; step < 4; step++) {
          const r = row + dr * step;
          const c = col + dc * step;
          if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== color) break;
          count++;
        }
        if (count === 4) return true;
      }
    }
  }
  return false;
}

export function isDraw(board: Board): boolean {
  return board.every((row) => row.every((cell) => cell !== null));
}
