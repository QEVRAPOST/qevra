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
    headline: "An account built around stronger authorization.",
    body: "Connect an existing EVM wallet for public address, network and balance reads. A separate smart account and post-quantum custody remain unavailable while authorization and key-control security research continues.",
    status: { label: "Smart-account custody unavailable", material: "dotted" },
    capabilities: [
      { material: "outline", label: "EVM wallet connection and public reads", state: "Available · read-only" },
      { material: "dotted", label: "Smart-account custody", state: "Unavailable · not deployed" },
      { material: "outline", label: "Post-quantum signatures (ML-DSA)", state: "Under evaluation" },
      { material: "dotted", label: "Deposits and recovery", state: "Unavailable" },
    ],
    how: [
      "Connect your existing wallet to read public account data. Security Swarm sign-in separately requests an explicit EIP-191 message signature; it does not authorize a blockchain transaction.",
      "A separate smart-account design is future work. No smart-account custody, deposits or recovery are available.",
      "ML-DSA (NIST FIPS 204) is a candidate for future post-quantum authorization. It is under evaluation, and VEYRA makes no claim that it resists quantum attacks.",
      "No smart account contract, deposit path or recovery exists yet. Known issues in key registration are unresolved, so no verifier or custody is approved. Independent review is needed before any mainnet use.",
    ],
    cta: { label: "Open wallet", href: "/app/wallet" },
  },
  {
    id: "swap",
    number: "02",
    kicker: "Simple swap + Intent Lock",
    headline: "Review every detail before execution.",
    body: "Explore the Intent Lock parameter-comparison preview. There is no live quote, supported route or swap execution, so no trade can be made.",
    status: { label: "Interactive preview · Execution unavailable", material: "dotted" },
    capabilities: [
      { material: "outline", label: "Intent Lock comparison", state: "Interactive example preview" },
      { material: "dotted", label: "Swap route and quotes", state: "Not configured" },
      { material: "dotted", label: "Execution", state: "Unavailable" },
    ],
    how: [
      "Example parameters are compared in the browser. This illustrates the intended review flow; it is not a live quote or an on-chain check.",
      "No parameter is signed or sent. A live route and quote are unavailable, and no execution contract is configured.",
      "The preview values are examples only. There is no price, quote or configured router, so no swap can execute.",
    ],
    cta: { label: "Try the swap preview", href: "/app/swap" },
  },
  {
    id: "swarm",
    number: "03",
    kicker: "Autonomous Security Swarm",
    headline: "Research, analyze, verify.",
    body: "The VEYRA Research Engine coordinates three stages: Research reads approved public sources, Analysis weighs claims, and Verification checks quoted evidence. A wallet-authenticated run has been demonstrated; service availability can vary.",
    status: { label: "Three-stage run demonstrated", material: "outline" },
    capabilities: [
      { material: "outline", label: "Research → Analysis → Verification", state: "Demonstrated" },
      { material: "outline", label: "Wallet-authenticated saved reports", state: "Available when authorized service is available" },
      { material: "dotted", label: "Independent audit", state: "None yet" },
    ],
    how: [
      "An authorized run produces findings with quoted evidence, sources and limitations. It is model-assisted research, not a verdict or security audit.",
      "Wallet sign-in is required to access wallet-owned reports. A finished run is never an approval, passed test or audit; human review is recorded separately.",
      "The Swarm works from approved public information and checks evidence against retrieved source text. It cannot reach private keys, sign transactions or move funds.",
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
