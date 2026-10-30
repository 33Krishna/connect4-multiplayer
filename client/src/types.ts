export type PlayerColor = "red" | "yellow";
export type Cell = PlayerColor | null;
export type Board = Cell[][];
export type Player = { id: PlayerColor; name: string; connected: boolean; rematchRequested: boolean };
export type RoomState = {
  code: string;
  board: Board;
  turn: PlayerColor;
  status: "waiting" | "playing" | "won" | "draw" | "expired";
  winner: PlayerColor | null;
  moveNumber: number;
  players: Player[];
};
export type Session = { code: string; playerId: PlayerColor; token: string };
