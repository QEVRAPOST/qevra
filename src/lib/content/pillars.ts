import type { Material } from "@/types";
import { brandizeProjectName } from "@/lib/project-brand";

/**
 * The three pillars the product is built around, as the landing's "three parts" section says them. The headlines and the status lines are
 * the PM's words; everything else restates approved copy and adds no claim past the evidence: nothing here says a smart account, a quote, a
 * router, a post-quantum guarantee, a live agent run or an audit exists.
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
    body: "The long-term goal is to protect control of assets with explicitly validated authorization rules, and to research post-quantum signatures for them. It is a separate account, apart from the wallet you connect.",
    status: { label: "Security architecture under evaluation", material: "outline" },
    capabilities: [
      { material: "dotted", label: "A separate smart account", state: "Not built" },
      { material: "outline", label: "Post-quantum signatures (ML-DSA)", state: "Under evaluation" },
      { material: "dotted", label: "Deposits and recovery", state: "Not built" },
    ],
    how: [
      "You connect the wallet you already use. It keeps signing the way it always has, and QEVRA makes no protection claim for it.",
      "QEVRA would open a separate smart account. What may leave it is decided by authorization rules the account itself checks.",
      "ML-DSA (NIST FIPS 204) is the candidate for post-quantum signatures. It is under evaluation, and QEVRA makes no claim that it resists quantum attacks.",
      "No smart account contract, deposit path or recovery exists yet. Known issues in key registration are unresolved, so no verifier or custody is approved. Independent review is needed before any mainnet use.",
    ],
    cta: { label: "Open the wallet preview", href: "/app/wallet" },
  },
  {
    id: "swap",
    number: "02",
    kicker: "Simple swap + Intent Lock",
    headline: "Review every detail before execution.",
    body: "A simple token swap, where you review every parameter first. Intent Lock compares what you reviewed with what would be signed: token, amount, recipient, slippage, minimum output and authorization.",
    status: { label: "Interactive preview · Execution unavailable", material: "dotted" },
    capabilities: [
      { material: "outline", label: "Intent Lock comparison", state: "Interactive preview" },
      { material: "dotted", label: "Swap route and quotes", state: "Not configured" },
      { material: "dotted", label: "Execution", state: "Unavailable" },
    ],
    how: [
      "Each detail you reviewed gets its own pin. If a detail differs from what would be signed, its pin moves out of line and the light stops.",
      "A changed detail sends the swap back to review. Nothing is signed on the strength of an earlier review.",
      "In this preview every value is an example. There is no price, no quote and no router, so nothing can be swapped.",
    ],
    cta: { label: "Try the swap preview", href: "/app/swap" },
  },
  {
    id: "swarm",
    number: "03",
    kicker: "Autonomous Security Swarm",
    headline: "Research, analyze, verify.",
    body: "Three AI agents turn public information into findings backed by quoted evidence: Research reads approved sources, Analysis weighs the claims, Verification checks each quote. A person reviews separately.",
    status: { label: "Research integration in progress", material: "outline" },
    capabilities: [
      { material: "outline", label: "Research → Analysis → Verification", state: "Defined" },
      { material: "outline", label: "Live research runs", state: "No successful run yet" },
      { material: "dotted", label: "Independent audit", state: "None yet" },
    ],
    how: [
      "A run produces findings with quoted evidence, the sources and when they were read, and the limits of what it checked. It is a report, not a verdict.",
      "Human review is a separate boundary. A finished run is never an approval, a passed test or an audit.",
      "The Swarm works from public information and isolated test environments. It cannot reach private keys, sign, or move funds.",
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
