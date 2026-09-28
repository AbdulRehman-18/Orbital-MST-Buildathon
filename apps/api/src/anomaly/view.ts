import type { anomalies } from "@namma-seva/db";
import type { Request } from "express";

type Row = typeof anomalies.$inferSelect;

/** Only reviewers see rule names and details; everyone else gets a neutral marker (plan §14). */
export const canSeeAnomalyDetails = (req: Request) =>
  !!req.user?.roles.some((r) => r === "AUDITOR" || r === "ADMIN" || r === "GOVT_OFFICIAL");

export function anomalyView(row: Row, detailed: boolean): Row {
  if (detailed) return row;
  return { ...row, rule: "UNDER_REVIEW", severity: "LOW", details: {} };
}
