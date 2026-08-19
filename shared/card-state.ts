/**
 * Shared card-state contract — the single source of truth both the
 * connector (Dev A, emits) and the overlay (Dev B, renders) code against.
 *
 * The connector subscribes to KAWA Live's WebSocket (ws://localhost:3100/ws),
 * watches `live:display-tool` (coaching card) + `live:node-busy/idle` (thinking),
 * and normalizes them into a `CardState`. The overlay just renders `CardState`.
 */

export type Tier = "now" | "transition" | "later" | "covered";

export interface CardItem {
  /** Stable-ish id so the UI can diff/animate. Derive from text if KAWA omits one. */
  id: string;
  tier: Tier;
  text: string;
}

export interface CardState {
  /** KAWA session this card belongs to. */
  sessionId: string;
  /** All current coaching-card items across tiers. */
  items: CardItem[];
  /** True while an agent node is processing (drives the "on it…" dot). */
  thinking: boolean;
  /** epoch ms of last update. */
  updatedAt: number;
}

/** The connector emits these to the overlay (e.g. over stdout JSONL or a local WS). */
export type ConnectorEvent =
  | { type: "card"; state: CardState }
  | { type: "status"; sessionId: string; status: "starting" | "running" | "stopping" | "stopped" };

/** Convenience: the tier ordering for rendering (top → bottom). */
export const TIER_ORDER: Tier[] = ["now", "transition", "later", "covered"];
