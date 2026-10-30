# Connect 4 Multiplayer

A two-player, room-code-based Connect 4 game. No accounts or database required for v1.

## Stack

- React + TypeScript + Vite
- Node.js + Express + TypeScript
- Socket.IO for real-time communication
- In-memory room state (rooms are lost when the server restarts)

## Requirements

- Node.js 20+
- npm 10+

## Run locally

```bash
npm install
cp server/.env.example .env
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`) in two separate browser sessions or devices. For another device on the same Wi-Fi, use your computer's LAN IP and configure the client to reach the server using `VITE_SERVER_URL`.

Example `client/.env.local`:

```env
VITE_SERVER_URL=http://192.168.1.10:3001
```

The server listens on port 3001 by default.

## Deploy publicly on Render

Render supports persistent WebSocket connections for Node web services.

1. Push this repository to GitHub.
2. Create a **Web Service** on Render and connect the repository.
3. Set:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Environment variable: `NODE_ENV=production`
   - Environment variable: `CLIENT_ORIGIN=https://YOUR-FRONTEND-DOMAIN`
4. Deploy the backend. Its public URL will look like `https://your-service.onrender.com`.
5. Deploy the `client` as a static site (or use another static host):
   - Build command: `npm install && npm run build -w client`
   - Publish directory: `client/dist`
   - Environment variable at build time: `VITE_SERVER_URL=https://your-service.onrender.com`
6. Set `CLIENT_ORIGIN` on the backend to the exact frontend origin, redeploy, then open the static site's public URL.

For a single-origin deployment, the server can also serve `client/dist` after building both workspaces. Set `SERVE_CLIENT=true` and use `npm run build` / `npm start` on the web service. In that mode, the same Render service serves the UI and Socket.IO endpoint.

### Single-service Render deployment (simplest)

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment variables:
  - `NODE_ENV=production`
  - `SERVE_CLIENT=true`
  - `CLIENT_ORIGIN` can be omitted for same-origin deployment.

The server serves `client/dist` and Socket.IO from the same public origin.

## Gameplay and protocol

- Exactly two seats: Red (room creator) and Yellow (joiner).
- Room codes are four letters, excluding ambiguous characters.
- The server owns the board, turn, win/draw result, player seats and rematch votes.
- A move is submitted as a column index from 0 to 6 and a unique `moveId`.
- The server rejects moves from non-members, out-of-turn players, invalid columns, full columns and completed games.
- Reconnection uses a high-entropy token stored in the browser's local storage. A room code alone cannot reclaim a seat.
- Disconnected seats are reserved for 60 seconds. A player who returns with the matching token can reclaim their seat.
- Both players must request a rematch. The board resets after both votes arrive.

## Important v1 limitations

- In-memory rooms are lost when the process restarts or redeploys.
- This version is designed for one server instance. Do not run multiple instances without shared state and a Socket.IO adapter.
- A reconnect token is a bearer credential. Do not share it. Clear browser storage if you intentionally want to abandon a seat.
- Add rate limiting, structured logs, metrics, automated integration tests and Redis before treating this as a hardened public production service.
