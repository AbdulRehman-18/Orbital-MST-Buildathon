// Live updates (ported from DecentraliTrack's use-live-updates.ts): the indexer publishes over
// Postgres NOTIFY, the API relays over Socket.IO, and we invalidate TanStack Query caches.
// Mounted once at the app root so every page refreshes, whatever the layout renders.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { io } from "socket.io-client";
import { queryClient } from "./api";

const ENTITY_EVENTS = ["project:updated", "milestone:updated", "grievance:updated", "tender:updated", "role:updated", "chain:reorg"];

type Live = { connected: boolean; head: { head: number; indexed: number } | null };

const LiveContext = createContext<Live>({ connected: false, head: null });

export function LiveUpdatesProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [head, setHead] = useState<Live["head"]>(null);

  useEffect(() => {
    // Serverless hosts (Vercel) can't keep a socket open: refetch on a timer instead.
    if (import.meta.env.VITE_NS_LIVE === "off") {
      const poll = setInterval(() => void queryClient.invalidateQueries(), 15_000);
      return () => clearInterval(poll);
    }
    const socket = io({ path: "/api/socket.io", transports: ["websocket", "polling"] });
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Coalesce bursts (one block can touch many entities) into a single refetch.
    const invalidate = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void queryClient.invalidateQueries(), 400);
    };
    socket.on("connect", () => {
      setConnected(true);
      socket.emit("subscribe", "ledger");
      // Anything indexed while we were disconnected.
      invalidate();
    });
    socket.on("disconnect", () => setConnected(false));
    for (const e of ENTITY_EVENTS) socket.on(e, invalidate);
    socket.on("chain:pending", invalidate);
    socket.on("chain:head", (n: { head: number; indexed: number }) => setHead({ head: n.head, indexed: n.indexed }));
    return () => {
      clearTimeout(timer);
      socket.disconnect();
    };
  }, []);

  return <LiveContext.Provider value={{ connected, head }}>{children}</LiveContext.Provider>;
}

/** Live socket state (connection + latest head/indexed block). */
export const useLiveUpdates = () => useContext(LiveContext);
