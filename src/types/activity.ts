import type { Material, Tone } from "./status";

export type ActivityState = "pending" | "confirmed" | "reverted" | "rejected";

/** One transaction in plain words. A real row carries a real hash, time and explorer link. */
export interface ActivityRow {
  id: string;
  sentence: string;
  state: ActivityState;
  stateLabel: string;
  tone: Tone;
  material: Material;
  amount: string;
  note: string;
  /** fixture rows set this; real rows leave it undefined */
  exampleTag?: string;
  hash?: string;
  time?: string;
  explorerUrl?: string;
  detail: Array<{ label: string; value: string; href?: string }>;
}

export interface ActivityView {
  /** "ready" shows the rows, "empty" shows the empty state, "unavailable" says the feed is not connected */
  status: "ready" | "empty" | "unavailable";
  rows: ActivityRow[];
  /** chip in the panel heading, for example EXAMPLE ROWS */
  sourceTag?: string;
}
