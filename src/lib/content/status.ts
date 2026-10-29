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
    part: "VEYRA Account and external wallet access",
    tone: "neutral",
    material: "solid",
    statusLabel: "Available · read-only wallet",
    note: "Email/password opens a VEYRA Account independently. An optional supported EVM wallet exposes its authorized address, actual chain and public native balance; wallet-owned research requires separate, explicit EIP-191 proof.",
  },
  {
    id: "smart-account",
    part: "Experimental ERC-4337 smart-account custody",
    tone: "exp",
    material: "outline",
    statusLabel: "Experimental · Testnet-only",
    note: "The ERC-4337 implementation remains experimental. VEYRA smart-account custody is not deployed for Mainnet, and on-chain post-quantum authorization is unavailable.",
  },
  {
    id: "ml-dsa",
    part: "ML-DSA intent attestation",
    tone: "exp",
    material: "outline",
    statusLabel: "Experimental · off-chain",
    note: "Browser-local ML-DSA can sign and verify an experimental attestation bound to reviewed intent parameters. It is not a blockchain transaction signature and does not enforce custody on-chain.",
  },
  {
    id: "key-control",
    part: "Key control and recovery",
    tone: "unk",
    material: "dotted",
    statusLabel: "Not available",
    note: "No production VEYRA smart-account key custody or recovery path is available. An external EVM wallet continues to control its own keys.",
  },
  {
    id: "intent-lock",
    part: "Intent Lock review before wallet approval",
    tone: "exp",
    material: "outline",
    statusLabel: "Quote review · approval separate",
    note: "When a valid Mainnet quote is available, the review shows its transaction parameters and must be refreshed if they change. The external wallet still requires explicit approval; no on-chain PQ enforcement is available.",
  },
  {
    id: "swap-route",
    part: "Robinhood Mainnet 0x swap route",
    tone: "exp",
    material: "outline",
    statusLabel: "Live quote · service-dependent",
    note: "A real 0x quote is requested only when server configuration, Robinhood Mainnet preflight and route liquidity allow. No sample quote replaces an unavailable route, and a quote is not a confirmed transaction.",
  },
  {
    id: "swarm-runs",
    part: "Security Swarm research",
    tone: "demo",
    material: "solid",
    statusLabel: "Demonstrated · access-dependent",
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
