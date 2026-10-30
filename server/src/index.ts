import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { RoomManager } from "./rooms/manager.js";

const app = express();
const httpServer = createServer(app);
const port = Number(process.env.PORT || 3001);
const configuredOrigin = process.env.CLIENT_ORIGIN;
const corsOrigin = configuredOrigin ? configuredOrigin.split(",").map((s) => s.trim()) : true;

app.use(cors({ origin: corsOrigin, credentials: true }));
app.get("/health", (_req, res) => res.json({ ok: true, service: "connect4-server" }));

const io = new Server(httpServer, {
  cors: { origin: corsOrigin, methods: ["GET", "POST"], credentials: true },
  transports: ["websocket", "polling"]
});
const rooms = new RoomManager();
rooms.setExpireHandler((room) => {
  io.to(room.code).emit("room:expired", { message: "The reconnection window expired. This room is now closed." });
  io.to(room.code).emit("room:state", rooms.publicState(room));
});

function emitState(room: ReturnType<RoomManager["create"]>["room"]) {
  io.to(room.code).emit("room:state", rooms.publicState(room));
}

io.on("connection", (socket) => {
  socket.on("room:create", (payload: { name?: string }, ack?: (data: unknown) => void) => {
    try {
      const { room, seat } = rooms.create(String(payload?.name ?? ""), socket.id);
      socket.join(room.code);
      ack?.({ ok: true, code: room.code, playerId: seat.id, token: seat.token, state: rooms.publicState(room) });
      emitState(room);
    } catch (error) {
      ack?.({ ok: false, error: error instanceof Error ? error.message : "Could not create room." });
    }
  });

  socket.on("room:join", (payload: { code?: string; name?: string }, ack?: (data: unknown) => void) => {
    try {
      const code = String(payload?.code ?? "").toUpperCase();
      if (!/^[A-HJ-NP-Z]{4}$/.test(code)) throw new Error("Enter a valid four-letter room code.");
      const { room, seat } = rooms.join(code, String(payload?.name ?? ""), socket.id);
      socket.join(room.code);
      ack?.({ ok: true, code: room.code, playerId: seat.id, token: seat.token, state: rooms.publicState(room) });
      emitState(room);
    } catch (error) {
      ack?.({ ok: false, error: error instanceof Error ? error.message : "Could not join room." });
    }
  });

  socket.on("room:resume", (payload: { code?: string; token?: string }, ack?: (data: unknown) => void) => {
    try {
      const code = String(payload?.code ?? "").toUpperCase();
      const token = String(payload?.token ?? "");
      const { room, seat } = rooms.resume(code, token, socket.id);
      socket.join(room.code);
      ack?.({ ok: true, code: room.code, playerId: seat.id, token: seat.token, state: rooms.publicState(room) });
      io.to(room.code).emit("player:reconnected", { playerId: seat.id });
      emitState(room);
    } catch (error) {
      ack?.({ ok: false, error: error instanceof Error ? error.message : "Could not reconnect." });
    }
  });

  socket.on("game:move", (payload: { code?: string; column?: number; moveId?: string }, ack?: (data: unknown) => void) => {
    try {
      const room = rooms.move(String(payload?.code ?? "").toUpperCase(), socket.id, Number(payload?.column), String(payload?.moveId ?? ""));
      ack?.({ ok: true, moveNumber: room.moveNumber });
      emitState(room);
    } catch (error) {
      ack?.({ ok: false, error: error instanceof Error ? error.message : "Move rejected." });
    }
  });

  socket.on("game:rematch", (payload: { code?: string }, ack?: (data: unknown) => void) => {
    try {
      const room = rooms.requestRematch(String(payload?.code ?? "").toUpperCase(), socket.id);
      ack?.({ ok: true });
      emitState(room);
    } catch (error) {
      ack?.({ ok: false, error: error instanceof Error ? error.message : "Rematch request rejected." });
    }
  });

  socket.on("disconnect", () => {
    const room = rooms.disconnect(socket.id);
    if (room) {
      io.to(room.code).emit("player:disconnected", { gracePeriodSeconds: 60 });
      emitState(room);
    }
  });
});

if (process.env.SERVE_CLIENT === "true") {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(thisDir, "../../client/dist");
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  } else {
    console.warn("SERVE_CLIENT=true but client/dist was not found. Run the root build first.");
  }
}

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Connect 4 server listening on port ${port}`);
});
