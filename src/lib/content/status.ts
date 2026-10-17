import type { CoverageRow, StatusBarItem } from "@/types";

/**
 * Landing status bar and coverage table.
 *
 * These are the design-preview values. In production both come from the engineering status and coverage
 * data (the CoverageRow contract), and a row changes status only when that data says so.
 */
export const STATUS_BAR_ITEMS: StatusBarItem[] = [
  { id: "stage", tone: "exp", text: "Experimental · testnet design preview" },
  { id: "mldsa", tone: "exp", text: "ML-DSA authorization: under evaluation" },
  { id: "audit", tone: "unk", text: "Independent audit: none yet" },
  { id: "router", tone: "unk", text: "Swap router: not configured" },
];

export const COVERAGE_ROWS: CoverageRow[] = [
  {
    id: "wallet-connection",
    part: "Wallet connection",
    tone: "unk",
    material: "dotted",
    statusLabel: "Design preview",
    note: "Not built. The Connect wallet button only changes this page.",
  },
  {
    id: "smart-account",
    part: "QEVRA smart account",
    tone: "exp",
    material: "outline",
    statusLabel: "Experimental",
    note: "Design preview. No contract exists in this page.",
  },
  {
    id: "ml-dsa",
    part: "ML-DSA authorization",
    tone: "exp",
    material: "outline",
    statusLabel: "Under evaluation",
    note: "The initial candidate scheme (NIST FIPS 204). QEVRA makes no claim that it resists quantum attacks.",
  },
  {
    id: "key-control",
    part: "Key control and recovery",
    tone: "unk",
    material: "dotted",
    statusLabel: "Not decided",
    note: "Which key controls the account, and what the connected wallet can do after setup, is still being designed.",
  },
  {
    id: "intent-lock",
    part: "Intent Lock comparison",
    tone: "unk",
    material: "dotted",
    statusLabel: "Design preview",
    note: "A field-by-field comparison on example values. No test is recorded as passed.",
  },
  {
    id: "swap-route",
    part: "Simple swap route",
    tone: "unk",
    material: "dotted",
    statusLabel: "Not configured",
    note: "No router is set, so no quote is shown.",
  },
  {
    id: "swarm-runs",
    part: "Security Swarm runs",
    tone: "demo",
    material: "outline",
    statusLabel: "Examples only",
    note: "DEMO DATA. No run has been done.",
  },
  {
    id: "disclosure",
    part: "Responsible disclosure path",
    tone: "unk",
    material: "dotted",
    statusLabel: "Not published",
    note: "No reporting path exists yet.",
  },
  {
    id: "audit",
    part: "Independent audit",
    tone: "unk",
    material: "dotted",
    statusLabel: "No audit yet",
    note: "No audit has been completed.",
  },
];
