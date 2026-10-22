import type { CoverageRow, StatusBarItem } from "@/types";

/**
 * Landing status bar and coverage table.
 *
 * These public capability claims describe the current product surface. Live service availability is checked inside the app.
 */
export const STATUS_BAR_ITEMS: StatusBarItem[] = [
  { id: "stage", tone: "exp", text: "Robinhood Chain · read-only public access" },
  { id: "mldsa", tone: "exp", text: "ML-DSA authorization: under evaluation" },
  { id: "audit", tone: "unk", text: "Independent audit: none yet" },
  { id: "router", tone: "unk", text: "Swap router: not configured" },
];

export const COVERAGE_ROWS: CoverageRow[] = [
  {
    id: "wallet-connection",
    part: "Wallet connection and public reads",
    tone: "exp",
    material: "outline",
    statusLabel: "Available · read-only",
    note: "Connect a supported EVM wallet to read its authorized address, actual chain and public native balance. No transactions are signed or sent.",
  },
  {
    id: "smart-account",
    part: "Smart-account custody",
    tone: "exp",
    material: "outline",
    statusLabel: "Unavailable · not deployed",
    note: "Smart-account custody and post-quantum authorization are unavailable while the five future security-research slots remain unresolved.",
  },
  {
    id: "ml-dsa",
    part: "ML-DSA authorization",
    tone: "exp",
    material: "outline",
    statusLabel: "Under evaluation",
    note: "The initial candidate scheme (NIST FIPS 204). VEYRA makes no claim that it resists quantum attacks.",
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
    statusLabel: "Demonstrated · service-dependent",
    note: "A wallet-authenticated Research → Analysis → Verification run has been demonstrated. Existing reports require authorization; availability for new runs depends on provider, billing and worker status. This is research, not an audit.",
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
