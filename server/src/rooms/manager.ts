import { randomBytes, randomInt } from "node:crypto";
import { Board, emptyBoard, dropDisc, hasWon, isDraw, PlayerColor } from "../game/engine.js";

export type Seat = {
  id: PlayerColor;
  name: string;
  token: string;
  socketId: string | null;
  connected: boolean;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  rematchRequested: boolean;
};

export type Room = {
  code: string;
  board: Board;
  turn: PlayerColor;
  status: "waiting" | "playing" | "won" | "draw" | "expired";
  winner: PlayerColor | null;
  players: Partial<Record<PlayerColor, Seat>>;
  moveNumber: number;
  processedMoveIds: Set<string>;
  createdAt: number;
};

export type PublicRoomState = {
  code: string;
  board: Board;
  turn: PlayerColor;
  status: Room["status"];
  winner: PlayerColor | null;
  moveNumber: number;
  players: Array<{ id: PlayerColor; name: string; connected: boolean; rematchRequested: boolean }>;
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const RECONNECT_MS = 60_000;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private onExpire: ((room: Room) => void) | null = null;

  setExpireHandler(handler: (room: Room) => void) { this.onExpire = handler; }

  create(name: string, socketId: string) {
    let code = "";
    do {
      code = Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    } while (this.rooms.has(code));

    const seat = this.newSeat("red", name, socketId);
    const room: Room = {
      code, board: emptyBoard(), turn: "red", status: "waiting", winner: null,
      players: { red: seat }, moveNumber: 0, processedMoveIds: new Set(), createdAt: Date.now()
    };
    this.rooms.set(code, room);
    return { room, seat };
  }

  join(codeInput: string, name: string, socketId: string) {
    const code = codeInput.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new Error("Room not found. Check the code and try again.");
    if (room.status === "expired") throw new Error("This room has expired.");
    if (room.players.yellow) throw new Error("This room already has two players.");
    const seat = this.newSeat("yellow", name, socketId);
    room.players.yellow = seat;
    room.status = "playing";
    return { room, seat };
  }

  resume(codeInput: string, token: string, socketId: string) {
    const room = this.rooms.get(codeInput.toUpperCase());
    if (!room) throw new Error("Room not found or no longer available.");
    const seat = (["red", "yellow"] as const).map((id) => room.players[id]).find((p) => p?.token === token);
    if (!seat) throw new Error("Reconnect token is invalid.");
    if (seat.disconnectTimer) clearTimeout(seat.disconnectTimer);
    seat.disconnectTimer = null;
    seat.socketId = socketId;
    seat.connected = true;
    if (room.status === "expired") throw new Error("This room has expired.");
    if (room.players.red?.connected && room.players.yellow?.connected && room.status === "waiting") room.status = "playing";
    return { room, seat };
  }

  move(code: string, socketId: string, column: number, moveId: string) {
    const room = this.rooms.get(code);
    if (!room) throw new Error("Room not found.");
    const seat = this.seatForSocket(room, socketId);
    if (!seat) throw new Error("You are not a player in this room.");
    if (room.status !== "playing") throw new Error("The game is not currently accepting moves.");
    if (room.turn !== seat.id) throw new Error("It is not your turn.");
    if (!Number.isInteger(column) || column < 0 || column > 6) throw new Error("Invalid column.");
    if (typeof moveId !== "string" || moveId.length < 8 || moveId.length > 100) throw new Error("Invalid move identifier.");
    if (room.processedMoveIds.has(moveId)) return room;
    const result = dropDisc(room.board, column, seat.id);
    if (!result) throw new Error("That column is full. Choose another column.");
    room.board = result.board;
    room.moveNumber++;
    room.processedMoveIds.add(moveId);
    if (room.processedMoveIds.size > 200) room.processedMoveIds.clear();
    if (hasWon(room.board, seat.id)) {
      room.status = "won";
      room.winner = seat.id;
    } else if (isDraw(room.board)) {
      room.status = "draw";
    } else {
      room.turn = seat.id === "red" ? "yellow" : "red";
    }
    return room;
  }

  requestRematch(code: string, socketId: string) {
    const room = this.rooms.get(code);
    if (!room) throw new Error("Room not found.");
    const seat = this.seatForSocket(room, socketId);
    if (!seat) throw new Error("You are not a player in this room.");
    if (room.status !== "won" && room.status !== "draw") throw new Error("Rematch is available after the game ends.");
    seat.rematchRequested = true;
    const red = room.players.red;
    const yellow = room.players.yellow;
    if (red?.rematchRequested && yellow?.rematchRequested) {
      room.board = emptyBoard();
      room.turn = room.turn === "red" ? "yellow" : "red";
      room.status = red.connected && yellow.connected ? "playing" : "waiting";
      room.winner = null;
      room.moveNumber = 0;
      room.processedMoveIds.clear();
      red.rematchRequested = false;
      yellow.rematchRequested = false;
    }
    return room;
  }

  disconnect(socketId: string) {
    for (const room of this.rooms.values()) {
      const seat = this.seatForSocket(room, socketId);
      if (!seat) continue;
      seat.connected = false;
      seat.socketId = null;
      if (seat.disconnectTimer) clearTimeout(seat.disconnectTimer);
      seat.disconnectTimer = setTimeout(() => {
        room.status = "expired";
        room.players.red && (room.players.red.connected = false);
        room.players.yellow && (room.players.yellow.connected = false);
        this.onExpire?.(room);
        this.rooms.delete(room.code);
      }, RECONNECT_MS);
      return room;
    }
    return null;
  }

  publicState(room: Room): PublicRoomState {
    return {
      code: room.code, board: room.board, turn: room.turn, status: room.status,
      winner: room.winner, moveNumber: room.moveNumber,
      players: (["red", "yellow"] as const).flatMap((id) => {
        const p = room.players[id];
        return p ? [{ id, name: p.name, connected: p.connected, rematchRequested: p.rematchRequested }] : [];
      })
    };
  }

  private seatForSocket(room: Room, socketId: string) {
    return (["red", "yellow"] as const).map((id) => room.players[id]).find((p) => p?.socketId === socketId) ?? null;
  }

  private newSeat(id: PlayerColor, name: string, socketId: string): Seat {
    return {
      id, name: name.trim().slice(0, 20) || (id === "red" ? "Player 1" : "Player 2"),
      token: randomBytes(32).toString("base64url"), socketId, connected: true,
      disconnectTimer: null, rematchRequested: false
    };
  }
}
