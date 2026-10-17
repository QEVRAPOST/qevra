/**
 * Status vocabulary shared by every screen (docs/QEVRA_DESIGN_DIRECTION.md section 2.3 and 2.4).
 *
 * Status is carried by the shape of a small circle, never by colour alone:
 *   solid   = evidenced (a recorded fact)
 *   outline = experimental or under evaluation
 *   dotted  = unknown, not built, not configured
 */
export type Material = "solid" | "outline" | "dotted";

/**
 * Chip tone. `ok` (lime) is reserved for a deterministic test that actually passed.
 * Components render the tone they are given: they never decide a status themselves.
 */
export type Tone = "neutral" | "exp" | "unk" | "ok" | "bad" | "demo";

/** One line of the status bar at the top of every page. */
export interface StatusBarItem {
  id: string;
  tone: "exp" | "unk";
  text: string;
}

/** One row of the coverage table. The status bar and the Status route read the same kind of data. */
export interface CoverageRow {
  id: string;
  part: string;
  tone: Tone;
  material: Material;
  statusLabel: string;
  note: string;
  evidenceHref?: string;
}

/** Label plus the status material that goes with it. */
export interface StatusBadge {
  label: string;
  tone: Tone;
  material: Material;
}
