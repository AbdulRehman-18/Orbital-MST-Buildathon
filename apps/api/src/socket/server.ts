// Live updates for the web app. The indexer (separate process) publishes over Postgres NOTIFY; this
// relays each notification to Socket.IO rooms. Clients join rooms with `subscribe`:
//   "ledger"            every confirmed entity change + head ticks
//   "project:<id>"      one project, its milestones / grievances / tenders
//   "tx:<hash>"         status of one tracked transaction
import type { Server as HttpServer } from "node:http";
import type pg from "pg";
import type { Logger } from "pino";
import { Server } from "socket.io";
import { NOTIFY_CHANNEL, type IndexerNotification } from "../indexer/notify";
import { SOCKET_EVENTS } from "./events";

const ROOM = /^(ledger|project:\d{1,18}|tx:0x[0-9a-f]{64})$/;

export function createSocketServer(http: HttpServer, corsOrigins: string[], logger: Logger) {
  const io = new Server(http, {
    path: "/api/socket.io",
    cors: { origin: corsOrigins, credentials: true },
    serveClient: false,
  });

  io.on("connection", (socket) => {
    socket.on(SOCKET_EVENTS.subscribe, (room: unknown) => {
      if (typeof room === "string" && ROOM.test(room.toLowerCase())) void socket.join(room.toLowerCase());
    });
    socket.on(SOCKET_EVENTS.unsubscribe, (room: unknown) => {
      if (typeof room === "string") void socket.leave(room.toLowerCase());
    });
  });

  return {
    io,
    dispatch: (notes: IndexerNotification[]) => dispatch(io, notes),
    /** LISTEN on a dedicated connection; reconnects if the connection drops. */
    async listen(pool: pg.Pool) {
      let client: pg.PoolClient | undefined;
      const connect = async () => {
        try {
          client = await pool.connect();
          client.on("notification", (msg) => {
            if (msg.channel !== NOTIFY_CHANNEL || !msg.payload) return;
            try {
              dispatch(io, JSON.parse(msg.payload) as IndexerNotification[]);
            } catch (err) {
              logger.warn({ err }, "Bad indexer notification");
            }
          });
          client.on("error", (err) => {
            logger.warn({ err: err.message }, "LISTEN connection lost — reconnecting");
            client?.release(true);
            setTimeout(connect, 2000);
          });
          await client.query(`LISTEN ${NOTIFY_CHANNEL}`);
        } catch (err) {
          logger.warn({ err: (err as Error).message }, "LISTEN failed — retrying");
          setTimeout(connect, 5000);
        }
      };
      await connect();
      return () => client?.release();
    },
  };
}

export function dispatch(io: Server, notes: IndexerNotification[]) {
  for (const n of notes) {
    switch (n.type) {
      case "entity": {
        const event = SOCKET_EVENTS.entity[n.kind];
        const payload = { id: n.id, projectId: n.projectId ?? (n.kind === "project" ? n.id : undefined) };
        io.to("ledger").emit(event, payload);
        if (payload.projectId) io.to(`project:${payload.projectId}`).emit(event, payload);
        break;
      }
      case "pending":
        io.to("ledger").emit(SOCKET_EVENTS.pending, n);
        if (typeof n.args.projectId === "string") io.to(`project:${n.args.projectId}`).emit(SOCKET_EVENTS.pending, n);
        break;
      case "tx":
        io.to(`tx:${n.txHash}`).emit(SOCKET_EVENTS.tx, n);
        break;
      case "head":
        io.to("ledger").emit(SOCKET_EVENTS.head, n);
        break;
      case "reorg":
        io.emit(SOCKET_EVENTS.reorg, n);
        break;
    }
  }
}
