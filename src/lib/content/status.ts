import type { CoverageRow, StatusBarItem } from "@/types";

/**
 * Landing status bar and coverage table.
 *
 * These public capability claims describe the current product surface. Live service availability is checked inside the app.
 */
export const STATUS_BAR_ITEMS: StatusBarItem[] = [
  { id: "stage", tone: "exp", text: "Robinhood Chain · public data" },
  { id: "mldsa", tone: "exp", text: "ML-DSA intent attestation · experimental" },
  { id: "audit", tone: "unk", text: "Independent audit · none" },
  { id: "router", tone: "unk", text: "Mainnet swap · 0x service-dependent" },
];

export const COVERAGE_ROWS: CoverageRow[] = [
  {
    id: "wallet-connection",
    part: "Wallet connection and public reads",
    tone: "exp",
    material: "outline",
    statusLabel: "Available · read-only",
    note: "Connect a supported EVM wallet to read its address, actual chain and native balance. Any transaction requires a separate wallet approval.",
  },
  {
    id: "smart-account",
    part: "Smart-account custody",
    tone: "exp",
    material: "outline",
    statusLabel: "Future architecture · not deployed",
    note: "VEYRA smart-account custody and on-chain post-quantum authorization are not deployed and remain under security review.",
  },
  {
    id: "ml-dsa",
    part: "ML-DSA authorization",
    tone: "exp",
    material: "outline",
    statusLabel: "Experimental · off-chain",
    note: "Browser-local ML-DSA can attest to a reviewed intent. It does not authorize a transaction or enforce post-quantum custody on-chain.",
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
    statusLabel: "Transaction review",
    note: "Intent Lock binds the reviewed Mainnet quote parameters. Wallet approval remains separate; no on-chain PQ enforcement is available.",
  },
  {
    id: "swap-route",
    part: "Robinhood Mainnet swap route",
    tone: "unk",
    material: "dotted",
    statusLabel: "Service-dependent",
    note: "The 0x quote flow requires live server configuration, verified RPC metadata and available liquidity. No sample quote replaces an unavailable route.",
  },
  {
    id: "swarm-runs",
    part: "Security Swarm runs",
    tone: "demo",
    material: "outline",
    statusLabel: "Demonstrated · service-dependent",
    note: "A wallet-authenticated Research → Analysis → Verification run has been demonstrated. Existing reports require authorization; new runs depend on provider, billing and worker availability. This is research, not an audit.",
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
