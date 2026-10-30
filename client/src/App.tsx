import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, CircleHelp, Copy, Crown, Gamepad2, Link2, LoaderCircle, LogOut, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { request, socket } from "./socket";
import type { RoomState, Session, PlayerColor } from "./types";

const STORAGE_KEY = "connect4.session.v1";

function readSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Session | null; }
  catch { return null; }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(readSession);
  const [state, setState] = useState<RoomState | null>(null);
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [screen, setScreen] = useState<"home" | "how" | "game">("home");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      const saved = readSession();
      if (saved) {
        request<{ code: string; playerId: PlayerColor; token: string; state: RoomState }>("room:resume", { code: saved.code, token: saved.token })
          .then((res) => { setSession(saved); setState(res.state); setScreen("game"); })
          .catch(() => { localStorage.removeItem(STORAGE_KEY); setSession(null); });
      }
    };
    const onDisconnect = () => setConnected(false);
    const onState = (next: RoomState) => setState(next);
    const onExpired = (payload: { message?: string }) => { setError(payload.message || "This room has expired."); localStorage.removeItem(STORAGE_KEY); setSession(null); setScreen("home"); };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:state", onState);
    socket.on("room:expired", onExpired);
    if (socket.connected) onConnect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:state", onState);
      socket.off("room:expired", onExpired);
    };
  }, []);

  const me = useMemo(() => state?.players.find((p) => p.id === session?.playerId), [state, session]);
  const opponent = useMemo(() => state?.players.find((p) => p.id !== session?.playerId), [state, session]);
  const myTurn = Boolean(state && session && state.status === "playing" && state.turn === session.playerId);
  const statusText = useMemo(() => {
    if (!state || !session) return "";
    if (state.status === "waiting") return "Waiting for your opponent to join…";
    if (state.status === "won") return state.winner === session.playerId ? "You won! Nice game." : "Your opponent won this round.";
    if (state.status === "draw") return "It's a draw!";
    if (!opponent?.connected) return "Opponent disconnected · waiting up to 60 seconds";
    return myTurn ? "Your turn — make your move" : `${opponent.name}'s turn`;
  }, [state, session, opponent, myTurn]);

  async function createRoom() {
    setBusy(true); setError("");
    try {
      const res = await request<{ code: string; playerId: PlayerColor; token: string; state: RoomState }>("room:create", { name });
      enterRoom(res);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function joinRoom() {
    setBusy(true); setError("");
    try {
      const res = await request<{ code: string; playerId: PlayerColor; token: string; state: RoomState }>("room:join", { name, code: roomCode.trim().toUpperCase() });
      enterRoom(res);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  function enterRoom(res: { code: string; playerId: PlayerColor; token: string; state: RoomState }) {
    const next = { code: res.code, playerId: res.playerId, token: res.token };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next); setState(res.state); setScreen("game"); setError("");
  }

  async function makeMove(column: number) {
    if (!session || !myTurn || busy) return;
    setError("");
    try {
      await request("game:move", { code: session.code, column, moveId: crypto.randomUUID() });
    } catch (e) { setError((e as Error).message); }
  }

  async function rematch() {
    if (!session) return;
    setError("");
    try { await request("game:rematch", { code: session.code }); }
    catch (e) { setError((e as Error).message); }
  }

  async function copyCode() {
    if (!state) return;
    try { await navigator.clipboard.writeText(state.code); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { setError("Could not copy the room code. You can select it manually."); }
  }

  function leaveRoom() {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null); setState(null); setScreen("home"); setError("");
  }

  if (screen === "how") return <HowToPlay onBack={() => setScreen("home")} />;
  if (screen === "game" && state && session) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <button className="icon-btn" onClick={leaveRoom} aria-label="Leave room"><ArrowLeft size={18} /></button>
          <div className="brand compact"><span className="brand-mark"><Gamepad2 size={18}/></span><span>CONNECT<span className="accent">4</span></span></div>
          <div className={`connection ${connected ? "online" : "offline"}`}>{connected ? <Wifi size={14}/> : <WifiOff size={14}/>} {connected ? "Connected" : "Reconnecting"}</div>
        </header>

        <section className="game-layout">
          <div className="game-heading">
            <div>
              <p className="eyebrow">PRIVATE MATCH</p>
              <h1>Room <span className="accent">{state.code}</span></h1>
              <p className="muted">Share the code with one friend to play.</p>
            </div>
            <button className="secondary-btn code-copy" onClick={copyCode}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "Copied" : "Copy code"}</button>
          </div>

          <div className="players-row">
            <PlayerCard player={state.players.find(p => p.id === "red")} color="red" active={state.status === "playing" && state.turn === "red"} isMe={session.playerId === "red"} />
            <div className="versus">VS</div>
            <PlayerCard player={state.players.find(p => p.id === "yellow")} color="yellow" active={state.status === "playing" && state.turn === "yellow"} isMe={session.playerId === "yellow"} />
          </div>

          <div className="status-pill"><span className={`status-dot ${state.status === "playing" ? "pulse" : ""}`}/>{statusText}</div>

          <div className="board-wrap">
            <div className="column-controls">
              {Array.from({ length: 7 }, (_, col) => (
                <button key={col} className="drop-control" disabled={!myTurn || state.board[0][col] !== null} onClick={() => makeMove(col)} aria-label={`Drop in column ${col + 1}`}>
                  <span>{col + 1}</span><span className="drop-arrow">↓</span>
                </button>
              ))}
            </div>
            <div className="board" role="grid" aria-label="Connect 4 board">
              {state.board.map((row, r) => row.map((cell, c) => (
                <button key={`${r}-${c}`} className="cell" role="gridcell" aria-label={`Row ${r + 1}, column ${c + 1}, ${cell ?? "empty"}`} disabled={!myTurn || state.status !== "playing" || cell !== null} onClick={() => makeMove(c)}>
                  <span className={`disc ${cell ?? "empty"}`} />
                </button>
              )))}
            </div>
          </div>

          {state.status === "won" || state.status === "draw" ? (
            <div className="result-panel">
              <div className="result-icon"><Crown size={22}/></div>
              <div><strong>{state.status === "draw" ? "A well-fought draw" : state.winner === session.playerId ? "Victory is yours" : "Match complete"}</strong><p>Request a rematch to play again.</p></div>
              <button className="primary-btn" onClick={rematch}>{me?.rematchRequested ? "Waiting for opponent" : <><RefreshCw size={16}/> Rematch</>}</button>
            </div>
          ) : null}
          {state.status === "waiting" && <div className="waiting-card"><LoaderCircle className="spin" size={18}/> Your room is ready. Send the code to your friend.</div>}
          {error && <div className="error-banner">{error}</div>}
          <p className="board-hint">Choose a column to drop your disc. Connect four in any direction to win.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="landing-shell">
      <nav className="topbar landing-nav">
        <div className="brand"><span className="brand-mark"><Gamepad2 size={20}/></span><span>CONNECT<span className="accent">4</span></span></div>
        <button className="text-btn" onClick={() => setScreen("how")}><CircleHelp size={16}/> How to play</button>
      </nav>
      <section className="hero">
        <div className="hero-copy">
          <div className="live-label"><span className="live-dot"/> REAL-TIME MULTIPLAYER</div>
          <h1>Four in a row.<br/><span className="gradient-text">One worthy rival.</span></h1>
          <p className="hero-subtitle">Challenge a friend to a classic strategy showdown. No accounts. No downloads. Just the next move.</p>
        </div>
        <div className="lobby-card">
          <div className="card-top"><div><p className="eyebrow">START A MATCH</p><h2>Ready to play?</h2></div><div className="card-icon"><Gamepad2 size={23}/></div></div>
          <label className="field-label" htmlFor="player-name">YOUR DISPLAY NAME</label>
          <input id="player-name" value={name} maxLength={20} onChange={e => setName(e.target.value)} placeholder="e.g. Krishna" />
          <button className="primary-btn full" disabled={busy} onClick={createRoom}>{busy ? <LoaderCircle className="spin" size={17}/> : <><span>Create a room</span><span>→</span></>}</button>
          <div className="or-divider"><span/>OR<span/></div>
          <label className="field-label" htmlFor="room-code">HAVE A ROOM CODE?</label>
          <div className="join-row"><input id="room-code" value={roomCode} maxLength={4} onChange={e => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} placeholder="ABCD" /><button className="secondary-btn" disabled={busy || roomCode.length !== 4} onClick={joinRoom}>Join room <Link2 size={15}/></button></div>
          {error && <div className="error-banner">{error}</div>}
          <div className="card-foot"><span><Wifi size={14}/> Live sync</span><span><LogOut size={14}/> No login needed</span><span>2 players</span></div>
        </div>
      </section>
      <footer className="landing-footer"><span>BUILT FOR FRIENDLY RIVALRIES</span><span>RED vs YELLOW · 7 × 6 BOARD</span></footer>
    </main>
  );
}

function PlayerCard({ player, color, active, isMe }: { player?: RoomState["players"][number]; color: PlayerColor; active: boolean; isMe: boolean }) {
  return <div className={`player-card ${active ? "active" : ""}`}>
    <span className={`player-disc ${color}`}/><div className="player-info"><strong>{player?.name || "Waiting…"}</strong><small>{isMe ? "YOU" : player ? "OPPONENT" : "OPEN SEAT"} · {player?.connected ? "ONLINE" : player ? "OFFLINE" : "NOT JOINED"}</small></div>
    {active && <span className="turn-tag">TURN</span>}
  </div>;
}

function HowToPlay({ onBack }: { onBack: () => void }) {
  return <main className="app-shell"><header className="topbar"><button className="icon-btn" onClick={onBack}><ArrowLeft size={18}/></button><div className="brand compact">HOW TO PLAY</div></header>
    <section className="how-card"><p className="eyebrow">THE RULES</p><h1>Four in a row.<br/><span className="gradient-text">That's the goal.</span></h1>
      <ol className="rules-list"><li><b>Take turns.</b><span>Red goes first, then Yellow. Players alternate turns.</span></li><li><b>Drop a disc.</b><span>Choose one of the seven columns. Your disc falls to the lowest open space.</span></li><li><b>Connect four.</b><span>Be the first to connect four discs horizontally, vertically or diagonally.</span></li><li><b>Play again.</b><span>If the board fills with no winner, it's a draw. Both players can agree to a rematch.</span></li></ol>
      <button className="primary-btn" onClick={onBack}>Got it — let's play <span>→</span></button>
    </section>
  </main>;
}
