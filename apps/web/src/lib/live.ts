// Live updates (ported from DecentraliTrack's use-live-updates.ts): the indexer publishes over
// Postgres NOTIFY, the API relays over Socket.IO, and we invalidate TanStack Query caches.
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { queryClient } from "./api";

const ENTITY_EVENTS = ["project:updated", "milestone:updated", "grievance:updated", "tender:updated", "role:updated", "chain:reorg"];

export function useLiveUpdates() {
  const [connected, setConnected] = useState(false);
  const [head, setHead] = useState<{ head: number; indexed: number } | null>(null);

  useEffect(() => {
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

  return { connected, head };
}
