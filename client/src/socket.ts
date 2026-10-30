import { io } from "socket.io-client";

const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;

export const socket = io(serverUrl, {
  autoConnect: true,
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500
});

export function request<T>(event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload, (err: Error | null, response: T & { ok?: boolean; error?: string }) => {
      if (err) return reject(new Error("The server did not respond. Check your connection."));
      if (!response?.ok) return reject(new Error(response?.error || "Request failed."));
      resolve(response);
    });
  });
}
