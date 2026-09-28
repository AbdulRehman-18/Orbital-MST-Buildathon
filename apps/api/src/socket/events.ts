/** Socket.IO event names shared with the web app. */
export const SOCKET_EVENTS = {
  subscribe: "subscribe",
  unsubscribe: "unsubscribe",
  entity: {
    project: "project:updated",
    milestone: "milestone:updated",
    grievance: "grievance:updated",
    tender: "tender:updated",
    role: "role:updated",
  },
  /** Seen in an unconfirmed block — show a "Pending" badge. */
  pending: "chain:pending",
  tx: "tx:status",
  head: "chain:head",
  /** Read model rolled back; clients should refetch. */
  reorg: "chain:reorg",
} as const;
