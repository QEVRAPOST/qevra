import type { Material } from "@/types";
import { brandizeProjectName } from "@/lib/project-brand";

/**
 * The three pillars the product is built around, as the landing's "three parts" section says them. The headlines and the status lines are
 * the PM's words; status labels reflect the demonstrated read-only wallet and three-stage research flow while retaining the explicit limits
 * on custody, swaps, post-quantum claims and independent audit.
 */
export type PillarId = "account" | "swap" | "swarm";

export interface PillarCapability {
  material: Material;
  label: string;
  state: string;
}

export interface Pillar {
  id: PillarId;
  number: string;
  /** short name, shown small above the headline */
  kicker: string;
  headline: string;
  /** two sentences at most */
  body: string;
  /** the state in the PM's words */
  status: { label: string; material: Material };
  capabilities: PillarCapability[];
  /** shown on request, under "How it is meant to work" */
  how: string[];
  cta: { label: string; href: string };
}

export const PILLARS_SECTION = {
  eyebrow: "What it is",
  title: "Three things {name} is built around.",
  lede: "Choose one to see how it works. Each one says what exists today.",
} as const;

export const PILLARS: readonly Pillar[] = [
  {
    id: "account",
    number: "01",
    kicker: "Post-quantum smart account",
    headline: "A future wallet with new authorization rules.",
    body: "Connect an external EVM wallet for public reads. VEYRA smart-account custody is not deployed, and on-chain post-quantum authorization remains under security review.",
    status: { label: "Future architecture · not deployed", material: "dotted" },
    capabilities: [
      { material: "outline", label: "External EVM wallet reads", state: "Available · public data" },
      { material: "dotted", label: "VEYRA smart-account custody", state: "Not deployed" },
      { material: "outline", label: "Browser-local ML-DSA intent attestation", state: "Experimental · off-chain" },
      { material: "dotted", label: "Deposits and recovery", state: "Not available" },
    ],
    how: [
      "Connect a wallet for public address, chain and balance reads. Research sign-in uses a separate, explicit EIP-191 message signature.",
      "The VEYRA smart account is a future design; custody, deposits and recovery are not available.",
      "ML-DSA-44 can attest locally to a reviewed intent. It is experimental and does not enforce transaction authorization on-chain.",
      "Key registration and authorization need security validation before any custody use. No VEYRA smart-account deployment is approved.",
    ],
    cta: { label: "Open wallet", href: "/app/wallet" },
  },
  {
    id: "swap",
    number: "02",
    kicker: "Robinhood Mainnet swap + Intent Lock",
    headline: "Review the route. Approve every action.",
    body: "Request a firm 0x quote for supported Mainnet tokens, review its route and intent, then authorize each wallet action. Live routes depend on service configuration, RPC checks and liquidity.",
    status: { label: "Live quote · configuration dependent", material: "dotted" },
    capabilities: [
      { material: "outline", label: "Robinhood Mainnet tokens and balances", state: "Verified metadata · public RPC" },
      { material: "dotted", label: "0x firm quote and route", state: "Available when service and liquidity permit" },
      { material: "outline", label: "Intent review and optional ML-DSA", state: "Local verification · not on-chain enforcement" },
      { material: "outline", label: "Allowance and swap transactions", state: "Separate, explicit wallet approval" },
    ],
    how: [
      "Select supported Robinhood Mainnet tokens and request a firm 0x quote. VEYRA checks token metadata, route and simulation before presenting a quote; no sample replaces a failed request.",
      "Review output, slippage, gas and route. Intent Lock binds the reviewed transaction parameters; optional ML-DSA attestation is a local review aid, not on-chain protection.",
      "Your wallet must be on Mainnet. Allowance approval and swap submission each require a separate wallet prompt. A transaction counts as confirmed only after its receipt is verified.",
    ],
    cta: { label: "Open Mainnet swap", href: "/app/swap" },
  },
  {
    id: "swarm",
    number: "03",
    kicker: "VEYRA Research Engine",
    headline: "Research, analyze, verify.",
    body: "Research, Analysis and Verification work from approved public sources and save evidence reports. New runs depend on provider, billing and worker availability; reports are research, not audits.",
    status: { label: "Three-stage run demonstrated", material: "outline" },
    capabilities: [
      { material: "outline", label: "Research → Analysis → Verification", state: "Three-agent run demonstrated" },
      { material: "outline", label: "Authorized saved reports", state: "Available to the report owner" },
      { material: "dotted", label: "Independent audit", state: "None yet" },
    ],
    how: [
      "A run records findings, quoted evidence, sources and limitations. This is model-assisted research, not a security audit.",
      "Wallet sign-in controls access to wallet-owned reports. Human review is separate from model results and must be recorded independently.",
      "The agents use approved public sources and check quotes against retrieved text. They cannot access keys, sign transactions or move funds.",
    ],
    cta: { label: "Open the Security Swarm", href: "/app/security" },
  },
];

/** The six details Intent Lock reviews in the pillar's demonstration, in the order the light passes them. */
export const LOCK_DETAILS: readonly string[] = ["Token", "Amount", "Recipient", "Slippage", "Minimum output", "Authorization"];

export const brandizePillar = (p: Pillar, name: string): Pillar => ({
  ...p,
  kicker: brandizeProjectName(p.kicker, name),
  body: brandizeProjectName(p.body, name),
  how: p.how.map((h) => brandizeProjectName(h, name)),
});
