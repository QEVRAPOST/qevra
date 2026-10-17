import type { Material } from "@/types";

/** Landing copy (docs/QEVRA_DESIGN_DIRECTION.md section 5.3). Sentence case, active voice, no claims past the evidence. */

export const HERO = {
  eyebrow: "A wallet and simple swap on Robinhood Chain",
  headline: "Authorize every detail of every swap.",
  lede: "QEVRA is a wallet and a simple swap for Robinhood Chain. It is designed to lock every swap detail you reviewed, and it explores post-quantum authorization in the open.",
} as const;

/** Frame indexes the nav and the hero button jump to (frame 0 is the hero, frames 1 to 6 are the steps). */
export const FRAME_HOW_IT_WORKS = 1;
export const FRAME_SWARM = 5;

export interface HeroFact {
  material: Material;
  lead: string;
  body: string;
}

export const HERO_FACTS: HeroFact[] = [
  { material: "outline", lead: "Wallet", body: "Connect the wallet you already use. QEVRA opens a separate smart account for its assets." },
  { material: "dotted", lead: "Simple swap", body: "One swap, with every detail reviewed before you sign. The router is not configured yet." },
  { material: "outline", lead: "Post-quantum research", body: "ML-DSA signatures are under evaluation, and an open Security Swarm researches and tests. Not audited." },
];

export interface StoryStep {
  id?: string;
  title: string;
  body: string;
  note?: string;
  /** display-type sentence with the amber left rule */
  core?: string;
  path?: Array<{ material: Material; lead: string; detail: string }>;
  /** ghost small button that goes to an app route */
  cta?: { label: string; href: string };
  /** primary Launch App button at the end of the step */
  launch?: boolean;
}

export const STORY_STEPS: StoryStep[] = [
  {
    title: "Every detail gets a ring",
    body: "A swap is a set of promises: who gets paid, on which chain, which tokens, how much, through which router, with what slippage limit, at which nonce, before which deadline. Each promise gets its own engraved ring.",
  },
  {
    title: "Review it, and the rings turn into place",
    body: "When you review a swap, each ring turns to the value you saw, starting at the top. When all eight match, a line of light can pass through the slots.",
    note: "Design preview. The light shows a comparison. It is not a guarantee.",
  },
  {
    title: "Change one detail and the line breaks",
    body: "If the amount is not what you reviewed, that ring turns out of line and the light stops there. You can see which detail moved. QEVRA is designed to ask for a fresh review before anything is signed.",
  },
  {
    title: "The experimental part is an outline",
    body: "The ring on top stands for ML-DSA, a post-quantum signature scheme that QEVRA is evaluating for its smart account. It is dashed because it is under evaluation. Nothing is drawn solid until there is evidence.",
    note: "ML-DSA is the initial candidate (NIST FIPS 204). QEVRA makes no claim that it resists quantum attacks.",
  },
  {
    id: "swarm",
    title: "The Security Swarm stays outside the gap",
    core: "The Security Swarm researches, tests, and reports. It does not control your wallet.",
    body: "Its ring sits apart from the stack, with an air gap between them. Its reports go to a human review dock, which stays unlit until a person records a review.",
    cta: { label: "See example runs", href: "/app/security" },
  },
  {
    id: "start",
    title: "Try the app preview",
    body: "Connect a wallet, open a QEVRA account, then make one swap. The preview uses example data only, and nothing in it can move funds.",
    path: [
      { material: "outline", lead: "Connect wallet", detail: "Use the wallet you already have, an external account." },
      { material: "outline", lead: "Open your QEVRA account", detail: "A separate smart account holds your QEVRA assets." },
      { material: "dotted", lead: "Swap", detail: "One simple swap, reviewed before you sign. No route is set yet." },
    ],
    launch: true,
  },
];

/** Figure caption per frame. Frame 0 starts with "Figure."; frames 1 to 6 start with "Step N of 6." */
export const FRAME_CAPTIONS: readonly string[] = [
  "Eight rings, one per swap detail.",
  "Eight rings, one per detail. Each is turned away until you review it.",
  "Each ring turns to its reviewed value. Light passes when all eight match.",
  "The amount ring is out of line, so the light stops there.",
  "The dashed ring is post-quantum authorization, under evaluation.",
  "The Swarm ring is separate, with an air gap and a human review dock.",
  "The whole object. Nothing is drawn solid without evidence.",
];

export const HOVER_HINT = "Move over a ring to read it.";

/** Try it toggle (hero frame only). */
export const TRY_LABEL = "Try it";
export const TRY_GROUP_LABEL = "Change the swap";
export const TRY_OPTIONS = ["As reviewed", "Change the amount"] as const;
export const TRY_CAPTIONS: ReadonlyArray<{ lead: string; body: string }> = [
  {
    lead: "Every ring matches",
    body: "what you reviewed, so light passes through all eight. This is a design preview of a comparison. It does not show that anything is secure.",
  },
  {
    lead: "The amount ring no longer matches.",
    body: "The light stops at that ring, so you can see which detail changed. QEVRA is designed to ask for a fresh review.",
  },
];

/** Plain-language line per ring, shown when a ring is hovered. They describe the design, not a working check. */
export const RING_DESCRIPTIONS: readonly string[] = [
  "Recipient: who receives the swapped tokens. A different address is a different swap.",
  "Chain ID: which network the swap is for. 46630 is Robinhood Testnet.",
  "Token in and out: the two tokens. The design allows only tokens from a reviewed list.",
  "Amount: how much you pay. If this changes after you review, the ring turns out of line.",
  "Router and allowance: which swap router, and how much it may pull. Not configured yet.",
  "Slippage and minimum out: the worst price you accept.",
  "Nonce: a one-time number, so an approval cannot be used twice.",
  "Deadline: when the approval runs out.",
];

export const FIGURE_LABEL =
  "Eight engraved rings stacked like a machined instrument, one ring per swap detail. A line of light runs through their aligned slots. An outlined ring above marks post-quantum authorization under evaluation. A separate ring at left stands for the Security Swarm, with an air gap between it and the stack.";

export const FIGURE_DESCRIPTION =
  "Eight rings stand for eight groups of swap details: recipient, chain, tokens, amount, router and allowance, slippage and minimum output, nonce and deadline. When every ring matches what you reviewed, a line of light passes through all eight. The outlined ring on top is post-quantum authorization, ML-DSA, which is under evaluation. The separate ring is the Security Swarm. It reports to a human review dock across an air gap and holds no keys.";

export const GLYPH_LABEL =
  "Eight stacked rings, one per swap detail. A line of light passes through when every detail matches what you reviewed, and stops at a ring that changed.";

/** Swarm band. */
export const SWARM_CAN: readonly string[] = [
  "Read public papers, advisories, standards and repositories.",
  "Run tests in isolated sandboxes that hold no production secrets.",
  "Report what it found, with its sources, its limits and what it could not verify.",
  "Propose a fix as a patch on a development branch.",
];

export const SWARM_CANNOT: readonly string[] = [
  "See or hold your private keys, post-quantum keys, seed phrases or signing sessions.",
  "Sign, swap, approve or transfer anything.",
  "Upgrade, pause, replace or deploy production contracts.",
  "Change signers, recovery rules, router allowlists or spending limits.",
  "Merge a fix. Tests, a human review and explicit approval come first.",
];

export const GAP_FIGURE_TITLE =
  "Three separate boxes: Security Swarm, Human review, and Your wallet. Reports pass from the Swarm to Human review. Nothing passes from the Swarm to your wallet, and the gap between them is marked as an air gap.";
export const GAP_FIGURE_CAPTION =
  "Reports reach a human review dock. The Swarm has no path to your keys, your signing, or your funds.";

export const STATUS_BAND_INTRO =
  "Nothing on this page is implemented. This table says what each part is meant to become, and how much is known about it now.";
