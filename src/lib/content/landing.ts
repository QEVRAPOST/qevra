import type { HeroPart, HeroPartId, Material } from "@/types";
import { PROJECT_NAME, brandizeProjectName, brandizeDisplayStrings } from "@/lib/project-brand";

export { DEFAULT_PROJECT_NAME } from "@/lib/project-brand";

/** Landing copy (docs/QEVRA_DESIGN_DIRECTION.md section 5.3). Sentence case, active voice, no claims past the evidence. */

export const HERO = {
  eyebrow: "POST-QUANTUM DEFI · ROBINHOOD CHAIN",
  headline: "The Next Era of DeFi.",
  lede: "Built for Robinhood Chain. Review Mainnet swaps with your wallet and explore post-quantum security research.",
  note: "Live quotes depend on service configuration. Post-quantum custody remains under research.",
} as const;

/** The closing section (the curtain at the bottom of the page). The words restate the approved hero and story copy. */
export const CURTAIN = {
  kicker: "Read Robinhood Chain",
  title: "Explore the evidence. Review every intent.",
  body: "Read public network data, explore configured swap routes, and review Security Swarm reports. Post-quantum wallet authorization remains under research.",
} as const;

/** Frame indexes the nav and the hero button jump to (frame 0 is the story intro, frames 1 to 7 are the steps). */
export const FRAME_HOW_IT_WORKS = 1;
export const FRAME_SWARM = 6;

export interface HeroFact {
  material: Material;
  lead: string;
  body: string;
}

export const HERO_FACTS: HeroFact[] = [
  { material: "outline", lead: "Wallet reads", body: "View address, actual network and native balance; swaps need separate approval." },
  { material: "dotted", lead: "Mainnet swap", body: "Request a configured 0x quote; approve each action in your wallet." },
  { material: "outline", lead: "Research Engine", body: "Three stages produce evidence reports, not audits." },
];

/**
 * The hero's three objects. The right side of the hero builds one of them at a time as the visitor scrolls,
 * so the first screen answers "what is this?" in three pictures: the wallet, the lock, the research.
 * Captions restate the approved copy and add no claim past the evidence.
 */
export interface HeroScene {
  /** short tab label */
  tab: string;
  /** name shown on the figure */
  name: string;
  lead: string;
  text: string;
  /** accessible description of the picture */
  label: string;
}

export const HERO_SCENES: readonly HeroScene[] = [
  {
    tab: "Account concept",
    name: "Future smart-account design",
    lead: "Not deployed.",
    text: "A future wallet architecture, separate from your connected account. No VEYRA smart account holds assets or enforces post-quantum authorization.",
    label:
      "A small vault with an open door, standing apart from a flat plate that stands for your connected wallet. Dashed outlines inside the vault are example assets, none are held. A dotted, crossed line between the plate and the vault marks that no deposit path exists yet.",
  },
  {
    tab: "Intent Lock",
    name: "Intent Lock",
    lead: "Review before wallet approval.",
    text: "Compare the quoted transaction details before your wallet authorizes them. ML-DSA attestation is off-chain and does not enforce the swap.",
    label:
      "A row of five pins on a rail, one per swap detail: recipient, chain, token, amount and deadline. A line passes through aligned slots to represent a local parameter match; it does not enforce transaction authorization on-chain.",
  },
  {
    tab: "Research + Swarm",
    name: "Security Swarm",
    lead: "Research → Analysis → Verification.",
    text: "Three research stages work from approved public sources and save evidence reports. Completed research is not an independent audit.",
    label:
      "An illustration of the Security Swarm, not a live run. The demonstrated workflow has three stages: Research, Analysis and Verification. A report with sources and limitations is separate from human review. A dashed lattice represents post-quantum research under evaluation. The Swarm does not access the connected wallet or move funds.",
  },
];

/**
 * What the visitor learns by pointing at a part of a hero object. The ids are the ones the scenes register
 * (src/lib/aperture/stage/*.ts). The words restate approved copy; they add no claim past the evidence.
 */
export const HERO_PARTS: Readonly<Record<HeroPartId, HeroPart>> = {
  /* 1. the smart account */
  "v-wallet": {
    name: "Your connected wallet",
    text: "Your external EVM account provides public reads and authorizes any swap transactions. Research login uses a separate, explicit EIP-191 message signature.",
    type: "EOA",
    brief: ["External wallet: public address, chain", "and balance reads. No transactions."],
  },
  "v-account": {
    name: "Future smart-account concept",
    text: "A future separate account concept. No smart-account contract or custody is available, and no assets are held.",
    type: "smart account",
    brief: ["A future separate-account concept.", "No custody or contract is available."],
  },
  "v-assets": {
    name: "Example assets",
    text: "Dashed outlines, because nothing is held. The tokens in this preview are TKN-A and TKN-B, examples only.",
    type: "TKN-A · TKN-B",
    brief: ["Dashed outlines: nothing is held.", "The tokens in this preview are examples."],
  },
  "v-link": {
    name: "No deposit path yet",
    text: "The line is dotted and crossed because it is not built. Nothing in this preview moves between the two accounts.",
    type: "not built",
    brief: ["Dotted and crossed: nothing moves", "between the two accounts yet."],
  },
  /* 2. Intent Lock */
  "t-recipient": {
    name: "Recipient (R)",
    text: "Who receives the swapped tokens. A different address is a different swap.",
    type: "address",
    brief: ["Who receives the swapped tokens.", "A different address is a different swap."],
  },
  "t-chain": {
    name: "Chain (C)",
    text: "The live swap workflow uses Robinhood Mainnet (4663).",
    type: "chainId",
    brief: ["The live swap workflow uses", "Robinhood Mainnet (4663)."],
  },
  "t-token": {
    name: "Token (T)",
    text: "The two tokens. The design allows only tokens from a reviewed list.",
    type: "token in → token out",
    brief: ["The two tokens being swapped.", "Only tokens from a reviewed list."],
  },
  "t-amount": {
    name: "Amount (A)",
    text: "How much you pay. If this changes after you review, its slot moves and the light stops.",
    type: "uint256",
    brief: ["How much you pay.", "Change it after review and its slot", "moves: the light stops here."],
  },
  "t-deadline": {
    name: "Deadline (D)",
    text: "When the approval runs out.",
    type: "timestamp",
    brief: ["When the approval runs out.", "After it, the same approval is void."],
  },
  "t-lamp": {
    name: "The details you reviewed",
    text: "The light starts here. It passes only if every slot is at the same height.",
    type: "reviewed set",
    brief: ["The light starts here, and passes only", "if every slot is at the same height."],
  },
  "t-receiver": {
    name: "The end of the line",
    text: "Light that reaches this end means every detail matched what you reviewed. It is a picture of a comparison, not a guarantee.",
    type: "all match",
    brief: ["Light that arrives here: every detail", "matched. A picture, not a guarantee."],
  },
  /* 3. post-quantum research and the Security Swarm */
  "l-coord": {
    name: "Coordinator",
    text: "Coordinates the Research, Analysis and Verification stages, then presents a saved report with sources and limitations. It is not a wallet and holds no keys.",
    type: "orchestrator",
    brief: ["Coordinates three research stages.", "Returns a report with evidence and limits.", "Holds no keys."],
  },
  "l-a-research": {
    name: "Research",
    text: "Reads public papers, advisories, standards and repositories. Nothing private.",
    type: "agent · reads",
    brief: ["Reads public papers, advisories,", "standards and repositories.", "Nothing private."],
  },
  "l-a-analysis": {
    name: "Analysis",
    text: "Weighs what was found against how VEYRA is designed, and says what it means.",
    type: "agent · weighs",
    brief: ["Weighs what was found against the", "design, and says what it means."],
  },
  "l-a-verify": {
    name: "Verification",
    text: "Checks quoted evidence against the retrieved source text and records what could not be verified.",
    type: "agent · cross-checks",
    brief: ["Checks quotes against retrieved source", "text and records limitations."],
  },
  "l-a-risk": {
    name: "Risk",
    text: "A conceptual role in the illustration, not an agent stage in the demonstrated three-stage workflow.",
    type: "illustrative role",
    brief: ["Illustrative role; not a live agent", "in the three-stage workflow."],
  },
  "l-a-policy": {
    name: "Policy",
    text: "A conceptual role in the illustration. A completed research run does not approve code changes or replace human review.",
    type: "illustrative role",
    brief: ["Illustrative role; a research run", "does not approve changes."],
  },
  "l-a-report": {
    name: "Report",
    text: "The three-stage workflow produces a saved report with sources and limitations. Human review is separate and must be recorded independently.",
    type: "saved research report",
    brief: ["Saved report with sources and limits.", "Human review is separate."],
  },
  "l-ring": {
    name: "Trust boundary",
    text: "The diagram shows a separation between research and wallet control. Agents use approved public sources; a completed report is not an approval or audit. This illustration is not a proof that nothing can go wrong.",
    type: "perimeter",
    brief: ["Research uses approved public sources.", "Reports do not control the wallet."],
  },
  "l-lattice": {
    name: "Post-quantum research",
    text: "Browser-local ML-DSA attestation can verify a reviewed intent. It is experimental, not enforced on-chain, and does not provide post-quantum custody.",
    type: "ML-DSA · FIPS 204",
    brief: ["The initial candidate scheme.", "Under evaluation, not audited.", "No claim that it resists quantum attacks."],
  },
  "l-dock": {
    name: "Human review",
    text: "Reports go here. A change needs passing tests, a security review and explicit human approval. The dock is unlit: no review is recorded.",
    type: "approval · unlit",
    brief: ["Reports go here. A person decides.", "The dock is unlit: no review is recorded."],
  },
  "l-gap": {
    name: "Air gap",
    text: "There is no execution or signing path between the Swarm and your wallet. It is a design boundary, not a promise that nothing can go wrong.",
    type: "no path",
    brief: ["No execution or signing path between", "the Swarm and your wallet."],
  },
  "l-wallet": {
    name: "Your wallet",
    text: "Signing stays with you. Agents have no authority to access private keys, sign transactions or move funds.",
    type: "EOA",
    brief: ["Signing stays with you.", "Agents cannot reach keys or move funds."],
  },
};

export const HERO_ROTATE_LABEL = "Rotate the object";
export const HERO_ROTATE_HINT = "Drag to rotate";
export const HERO_POINT_HINT = "Click a part to zoom in";
export const HERO_ZOOM_HINT = "Click again to zoom out";
export const HERO_STAGE_KEYS = "3D object. Left and Right arrows rotate it, Enter flies to the next part, Escape resets the view.";

/**
 * The hero copy is written with the default project name. The name is a setting (NEXT_PUBLIC_PROJECT_NAME, read on the
 * server by getProjectName), so the hero swaps it in where it shows the name.
 */
export const brandize = (text: string, name = PROJECT_NAME): string => brandizeProjectName(text, name);

export function brandizeStoryStep(step: StoryStep, name = PROJECT_NAME): StoryStep {
  return brandizeDisplayStrings(step, name);
}

/** What the Intent Lock object says while its slots line up, and when one detail has changed. */
export const HERO_LOCK_CAPTIONS: ReadonlyArray<{ lead: string; text: string }> = [
  {
    lead: "Intent verified locally.",
    text: "The reviewed parameters still match. The wallet must separately approve the EVM transaction; this does not enforce post-quantum authorization on-chain.",
  },
  {
    lead: "A parameter changed.",
    text: "The attestation no longer matches the intent. Refresh the quote and review the updated terms before wallet approval.",
  },
];

export const HERO_TABS_LABEL = "Choose a product scene";
export const HERO_SCROLL_HINT = "Scroll to change scene";

/** One sentence on what the Security Swarm is, at the head of its section (the hero's Research + Swarm tab says the same in its own words). */
export const SWARM_DEFINITION =
  "The Security Swarm is a coordinated set of specialist research agents. They investigate, cross-check and document risk, so that a person can review it before anything is approved.";

/** The first frame of the story: the ring sculpture is introduced before it is taken apart. */
export const STORY_INTRO: StoryStep = {
  id: "aperture",
  kicker: "How it works",
  title: "Three ideas. One connected product.",
  body: "Explore wallet architecture, transaction intent and evidence-based security research.",
};

export interface StoryStep {
  id?: string;
  /** small label above the title, for example "Chapter 1 of 3 · The smart account" */
  kicker?: string;
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
  /** the frame is taller, so the highlight can move through its rings at a readable pace */
  long?: boolean;
}

/**
 * The story after the hero: three chapters that move the camera over the same sculpture, then the closing frame.
 * The approved step copy is kept; steps that said the same thing in a wide shot are now the close-up chapters.
 */
export const STORY_STEPS: StoryStep[] = [
  {
    id: "account",
    kicker: "Chapter 1 of 3 · Read-only wallet",
    title: "Your wallet stays in your control",
    body: "Connect an EVM wallet to read its address, chain and balance. VEYRA smart-account custody is not deployed; post-quantum authorization remains future research.",
    path: [
      { material: "outline", lead: "External wallet", detail: "Public reads and explicit transaction approval. Research login uses a separate EIP-191 message signature." },
      { material: "dotted", lead: "Future VEYRA account", detail: "No deployed custody contract or on-chain PQ authorization." },
    ],
  },
  {
    id: "details",
    kicker: "Chapter 2 of 3 · Intent Lock",
    title: "Every swap has a defined intent",
    body: "Recipient, chain, tokens, amount, route, slippage, nonce and deadline define the transaction you review.",
    long: true,
  },
  {
    kicker: "Chapter 2 of 3 · Intent Lock",
    title: "Review the route before approval",
    body: "Intent Lock compares the quoted parameters you reviewed. Your wallet separately authorizes any allowance or swap transaction.",
    note: "ML-DSA attestation is optional and does not enforce the transaction on-chain.",
  },
  {
    kicker: "Chapter 2 of 3 · Intent Lock",
    title: "A changed intent needs a fresh review",
    body: "Changing a bound quote parameter invalidates the current review. Refresh the quote and review the new terms before approving them.",
    note: "The wallet remains the authority for the EVM transaction.",
  },
  {
    id: "outline",
    kicker: "Chapter 3 of 3 · Post-quantum research",
    title: "Post-quantum authorization remains experimental",
    body: "Browser-local ML-DSA can attest to a reviewed intent. It does not replace wallet approval, protect funds, or enforce authorization on-chain.",
    note: "Smart-account custody is unavailable pending security review.",
  },
  {
    id: "swarm",
    kicker: "Chapter 3 of 3 · The Security Swarm",
    title: "Evidence for a person to review",
    core: "The Security Swarm researches, analyzes, verifies, and reports. It does not control your wallet.",
    body: "Research → Analysis → Verification saves findings, sources and limitations. A completed report is not an independent audit; human review is separate.",
    cta: { label: "Open Security Swarm", href: "/app/security" },
  },
  {
    id: "start",
    title: "Explore VEYRA on Robinhood Chain",
    body: "Read public deployment evidence, connect a wallet for account reads, explore configured swap routes, or review saved Security Swarm reports.",
    path: [
      { material: "outline", lead: "Public deployment evidence", detail: "Verified deployments are open at /app/networks; no wallet is required." },
      { material: "outline", lead: "External wallet", detail: "Read address, actual chain and native balance; approve transactions explicitly." },
      { material: "outline", lead: "VEYRA Research Engine", detail: "Sign in to open saved reports. New runs depend on provider, billing and worker availability." },
    ],
    launch: true,
  },
];

/** Figure caption per frame: a bold lead, then one plain sentence. Frame 0 and the closing frame lead with "Figure." */
export const FRAME_CAPTIONS: ReadonlyArray<{ lead: string; text: string }> = [
  { lead: "Figure.", text: "Eight rings, one per swap detail." },
  { lead: "Chapter 1 of 3.", text: "Your connected wallet provides public reads. The smart-account illustration is a future concept, not an available contract." },
  { lead: "Chapter 2 of 3.", text: "Eight rings, one per detail. Each is turned away until you review it." },
  { lead: "Chapter 2 of 3.", text: "Each ring turns to its reviewed value. Light passes when all eight match." },
  { lead: "Chapter 2 of 3.", text: "The amount ring is out of line, so the light stops there." },
  { lead: "Chapter 3 of 3.", text: "The dashed ring is post-quantum authorization, under evaluation." },
  { lead: "Chapter 3 of 3.", text: "The Swarm ring is separate, with an air gap and a human review dock." },
  { lead: "Figure.", text: "The whole object. Nothing is drawn solid without evidence." },
];

export const HOVER_HINT = "Move over a ring to read it.";

/** Try it toggle (the hero's Intent Lock object). */
export const TRY_LABEL = "Try it";
export const TRY_GROUP_LABEL = "Change the swap";
export const TRY_OPTIONS = ["As reviewed", "Change the amount"] as const;

/** Plain-language line per ring, shown when a ring is hovered. They describe the design, not a working check. */
export const RING_DESCRIPTIONS: readonly string[] = [
  "Recipient: who receives the swapped tokens. A different address is a different swap.",
  "Chain ID: which Robinhood network the quote is for.",
  "Token in and out: tokens are selected from verified Robinhood Mainnet metadata.",
  "Amount: how much you pay. If this changes after you review, the ring turns out of line.",
  "Router and allowance: review the quoted target and exact required allowance.",
  "Slippage and minimum out: the worst price you accept.",
  "Nonce: a one-time number, so an approval cannot be used twice.",
  "Deadline: when the approval runs out.",
];

export const FIGURE_LABEL =
  "Eight engraved rings, one for each reviewed swap detail. A line of light passes through their aligned slots. An outlined ring represents experimental off-chain post-quantum intent attestation. A separate ring at left represents the Security Swarm.";

export const FIGURE_DESCRIPTION =
  "Eight rings stand for the reviewed swap details: recipient, chain, tokens, amount, route and allowance, slippage and minimum output, nonce and deadline. A line of light passing through represents a local intent match, not on-chain enforcement. The outlined ring represents experimental browser-local ML-DSA attestation. The separate ring represents the Security Swarm, which produces reports and holds no wallet keys.";

export const GLYPH_LABEL =
  "Eight stacked rings, one per swap detail. A line of light passes through when every detail matches what you reviewed, and stops at a ring that changed.";

/** Swarm band. */
export const SWARM_CAN: readonly string[] = [
  "Research approved public sources for the selected topic.",
  "Analyze source-backed claims and their implications.",
  "Check evidence quotes against retrieved source text and record limitations.",
  "Produce a saved report with findings, sources and limitations.",
];

export const SWARM_CANNOT: readonly string[] = [
  "See or hold your private keys, post-quantum keys, seed phrases or signing sessions.",
  "Sign, swap, approve or transfer anything.",
  "Upgrade, pause, replace or deploy production contracts.",
  "Change signers, recovery rules, router allowlists or spending limits.",
  "Merge a fix. Tests, a human review and explicit approval come first.",
];

/**
 * Each line of "It can" and "It cannot" points at a part of the Swarm diagram: scrolling to it lights the part, and the
 * rows (a row is a fact on a card, counted from 0) that say the same thing. `note` is the one line shown under the diagram.
 * They restate the approved lists above and add no capability.
 */
export type SwarmPart = "swarm" | "review" | "wallet" | "gap";
export interface SwarmFocus {
  /** where in the diagram it points, in words */
  ref: string;
  note: string;
  parts: SwarmPart[];
  rows: Partial<Record<Exclude<SwarmPart, "gap">, number[]>>;
  /** the reports path lights up */
  report?: boolean;
}

export const SWARM_CAN_FOCUS: readonly SwarmFocus[] = [
  { ref: "Security Swarm · research", note: "Researches approved public sources for the selected topic. Nothing private.", parts: ["swarm"], rows: { swarm: [0] } },
  { ref: "Security Swarm · analysis", note: "Analyzes source-backed claims and their implications.", parts: ["swarm"], rows: { swarm: [1] } },
  { ref: "Security Swarm · verification", note: "Checks quotes against retrieved source text and records what could not be verified.", parts: ["swarm"], rows: { swarm: [2] } },
  { ref: "Security Swarm · report", note: "Produces a saved report with findings, sources and limitations. A finished report is not an audit or approval.", parts: ["swarm", "review"], rows: { swarm: [3], review: [2] }, report: true },
];

export const SWARM_CANNOT_FOCUS: readonly SwarmFocus[] = [
  { ref: "Security Swarm · keys, Your wallet · keys", note: "Has no access to private keys, post-quantum keys, seed phrases or signing sessions.", parts: ["swarm", "wallet"], rows: { swarm: [4], wallet: [1] } },
  { ref: "Security Swarm · transaction signing, Your wallet · signs", note: "The Swarm cannot sign transactions. Any research-login message signature is initiated and approved by the wallet owner.", parts: ["swarm", "wallet"], rows: { swarm: [4], wallet: [0] } },
  { ref: "Air gap · Your wallet · Swarm", note: "No path crosses the air gap, so production contracts are out of the Swarm's reach.", parts: ["gap", "wallet"], rows: { wallet: [2] } },
  { ref: "Air gap · Your wallet · Swarm", note: "Signers, recovery rules, router allowlists and spending limits are out of its reach too.", parts: ["gap", "wallet"], rows: { wallet: [2, 3] } },
  { ref: "Human review · needs, decides", note: "A fix is merged only after passing tests, a security review and explicit human approval.", parts: ["review"], rows: { review: [1, 3, 4] } },
];

export const SWARM_DEFAULT_NOTE = "Scroll the list, or select a part of the diagram, to read what it can do and what it cannot.";

export const GAP_FIGURE_TITLE =
  "Three cards: Security Swarm, Human review, and Your wallet. Saved research reports can be reviewed by a person. Nothing passes from the Swarm to your wallet, and the span between them is marked as an air gap.";
export const GAP_FIGURE_CAPTION =
  "Reports reach a human review dock. The Swarm has no path to your keys, your signing, or your funds.";

export const STATUS_BAND_INTRO =
  "A concise view of available features, service-dependent routes and future security research.";
