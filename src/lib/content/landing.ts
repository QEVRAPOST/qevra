import type { Material } from "@/types";

/** Landing copy (docs/QEVRA_DESIGN_DIRECTION.md section 5.3). Sentence case, active voice, no claims past the evidence. */

export const HERO = {
  eyebrow: "A wallet and simple swap on Robinhood Chain",
  headline: "Authorize every detail of every swap.",
  lede: "QEVRA is a wallet and a simple swap for Robinhood Chain. It opens a separate smart account, checks every swap detail you reviewed with Intent Lock, and explores post-quantum authorization in the open.",
  /** under the buttons: what a visitor can actually do today */
  note: "Explore the preview with example data. Wallet and swap are not live yet.",
} as const;

/** The closing section (the curtain at the bottom of the page). The words restate the approved hero and story copy. */
export const CURTAIN = {
  kicker: "Design preview",
  title: "One swap, with every detail reviewed before you sign.",
  body: "Open the app preview to try it. It uses example data only, and nothing in it can move funds.",
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
  { material: "outline", lead: "Wallet", body: "Connect the wallet you already use. QEVRA opens a separate smart account for its assets." },
  { material: "dotted", lead: "Simple swap", body: "One swap, reviewed with Intent Lock before you sign. The router is not configured yet." },
  { material: "outline", lead: "Post-quantum research", body: "ML-DSA signatures are under evaluation, and a separate Security Swarm researches and tests in the open. Not audited." },
];

/**
 * The hero's three objects. The right side of the hero builds one of them at a time as the visitor scrolls,
 * so the first screen answers "what is this?" in three pictures: the account, the lock, the research.
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
    tab: "Smart account",
    name: "QEVRA smart account",
    lead: "A separate account.",
    text: "QEVRA opens its own smart account, apart from the wallet you connect. The outlines are examples: it holds nothing, and there is no deposit path yet.",
    label:
      "A small vault with an open door, standing apart from a flat plate that stands for your connected wallet. Dashed outlines inside the vault are example assets, none are held. A dotted, crossed line between the plate and the vault marks that no deposit path exists yet.",
  },
  {
    tab: "Intent Lock",
    name: "Intent Lock",
    lead: "Every detail has to match.",
    text: "Each swap detail you reviewed gets its own pin. When all of them match, the light passes. This is a design demonstration of the check QEVRA is designed to make.",
    label:
      "A row of five pins on a rail, one per swap detail: recipient, chain, token, amount and deadline. A line of light from a lamp on the left passes through a slot in each pin when they line up. It is a design demonstration, not a working lock.",
  },
  {
    tab: "Research + Swarm",
    name: "Post-quantum research and the Security Swarm",
    lead: "Researched in the open.",
    text: "ML-DSA signatures are under evaluation, drawn dashed because they are not audited. The Security Swarm researches, tests and reports to a human review dock. It holds no keys and has no path to your wallet.",
    label:
      "A small dashed lattice stands for post-quantum research that is under evaluation. Four agents orbit it: the Security Swarm, which holds no keys. Reports travel to a human review dock that is unlit in this preview. A glass wall, the air gap, stands in front of your wallet and the line to it is crossed out.",
  },
];

/**
 * What the visitor learns by pointing at a part of a hero object. The ids are the ones the scenes register
 * (src/lib/aperture/stage/*.ts). The words restate approved copy; they add no claim past the evidence.
 */
export const HERO_PARTS: Readonly<Record<string, { name: string; text: string }>> = {
  "v-wallet": { name: "Your connected wallet", text: "An external account. It signs the way it always has. QEVRA makes no protection claim for it." },
  "v-account": { name: "QEVRA smart account", text: "A separate address, designed for QEVRA assets. How it is authorized is still under evaluation. No smart account exists yet." },
  "v-assets": { name: "Example assets", text: "Dashed outlines, because nothing is held. The tokens in this preview are TKN-A and TKN-B, examples only." },
  "v-link": { name: "No deposit path yet", text: "The line is dotted and crossed because it is not built. Nothing in this preview moves between the two accounts." },
  "t-recipient": { name: "Recipient", text: "Who receives the swapped tokens. A different address is a different swap." },
  "t-chain": { name: "Chain", text: "Which network the swap is for. 46630 is Robinhood Testnet." },
  "t-token": { name: "Token", text: "The two tokens. The design allows only tokens from a reviewed list." },
  "t-amount": { name: "Amount", text: "How much you pay. If this changes after you review, its slot moves and the light stops." },
  "t-deadline": { name: "Deadline", text: "When the approval runs out." },
  "t-lamp": { name: "The details you reviewed", text: "The light starts here. It passes only if every slot is at the same height." },
  "t-receiver": { name: "The end of the line", text: "Light that reaches this end means every detail matched what you reviewed. It is a picture of a comparison, not a guarantee." },
  "l-lattice": { name: "Post-quantum research", text: "ML-DSA is the initial candidate scheme (NIST FIPS 204). It is under evaluation and not audited. QEVRA makes no claim that it resists quantum attacks." },
  "l-agents": { name: "Security Swarm", text: "Researches public sources, runs tests in isolated sandboxes and writes reports. It holds no keys and cannot sign." },
  "l-dock": { name: "Human review", text: "Reports go here. A change needs passing tests, a security review and explicit human approval. The dock is unlit: no review is recorded." },
  "l-gap": { name: "Air gap", text: "There is no execution or signing path between the Swarm and your wallet. It is a design boundary, not a promise that nothing can go wrong." },
  "l-wallet": { name: "Your wallet", text: "Signing stays with you. Agents have no authority to access private keys, sign transactions or move funds." },
};

export const HERO_ROTATE_LABEL = "Rotate the object";
export const HERO_ROTATE_HINT = "Drag to rotate";
export const HERO_POINT_HINT = "Click a part to zoom in";
export const HERO_ZOOM_HINT = "Click it again, or press Escape, to zoom out";
export const HERO_STAGE_KEYS = "3D object. Left and Right arrows rotate it, Enter flies to the next part, Escape resets the view.";

/**
 * The hero copy is written with the default project name. The name is a setting (NEXT_PUBLIC_PROJECT_NAME, read on the
 * server by getProjectName), so the hero swaps it in where it shows the name.
 */
export const DEFAULT_PROJECT_NAME = "QEVRA";
export const brandize = (text: string, name: string): string => (name === DEFAULT_PROJECT_NAME ? text : text.replaceAll(DEFAULT_PROJECT_NAME, name));

/** What the Intent Lock object says while its slots line up, and when one detail has changed. */
export const HERO_LOCK_CAPTIONS: ReadonlyArray<{ lead: string; text: string }> = [
  {
    lead: "Every detail matches.",
    text: "The light passes through all five pins. This is a design demonstration of a comparison. It does not show that anything is secure.",
  },
  {
    lead: "One detail changed.",
    text: "The Amount pin is out of line, so the light stops there and you can see which detail moved. QEVRA is designed to ask for a fresh review.",
  },
];

export const HERO_TABS_LABEL = "Choose an object";
export const HERO_SCROLL_HINT = "Scroll to change object";

/** The first frame of the story: the ring sculpture is introduced before it is taken apart. */
export const STORY_INTRO: StoryStep = {
  id: "aperture",
  kicker: "How it works",
  title: "One object explains the whole product.",
  body: "Eight rings, one for each swap detail. A dashed ring for post-quantum research, and a separate ring for the Security Swarm. Scroll to take it apart, one idea at a time.",
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
    kicker: "Chapter 1 of 3 · The smart account",
    title: "Two accounts, kept apart",
    body: "You connect the wallet you already use. QEVRA then opens a second, separate smart account with its own address, meant for the assets you choose to use with QEVRA.",
    path: [
      { material: "outline", lead: "Your connected wallet", detail: "An external account. It signs the way it always has. QEVRA makes no protection claim for it." },
      { material: "outline", lead: "QEVRA smart account", detail: "A separate address, designed for QEVRA assets. How it is authorized is still under evaluation." },
    ],
    note: "Design preview. No smart account exists, nothing is held, and no assets are protected by it.",
  },
  {
    id: "details",
    kicker: "Chapter 2 of 3 · Intent Lock",
    title: "Every detail gets a ring",
    body: "A swap is a set of promises: who gets paid, on which chain, which tokens, how much, through which router, with what slippage limit, at which nonce, before which deadline. Each promise gets its own engraved ring.",
    long: true,
  },
  {
    kicker: "Chapter 2 of 3 · Intent Lock",
    title: "Review it, and the rings turn into place",
    body: "When you review a swap, each ring turns to the value you saw, starting at the top. When all eight match, a line of light can pass through the slots.",
    note: "Design preview. The light shows a comparison. It is not a guarantee.",
  },
  {
    kicker: "Chapter 2 of 3 · Intent Lock",
    title: "Change one detail and the line breaks",
    body: "If the amount is not what you reviewed, that ring turns out of line and the light stops there. You can see which detail moved. QEVRA is designed to ask for a fresh review before anything is signed.",
    note: "A picture of the comparison QEVRA is designed to make. No onchain enforcement exists yet.",
  },
  {
    id: "outline",
    kicker: "Chapter 3 of 3 · Post-quantum research",
    title: "The experimental part is an outline",
    body: "The ring on top stands for ML-DSA, a post-quantum signature scheme that QEVRA is evaluating for its smart account. It is dashed because it is under evaluation. Nothing is drawn solid until there is evidence.",
    note: "ML-DSA is the initial candidate (NIST FIPS 204). QEVRA makes no claim that it resists quantum attacks.",
  },
  {
    id: "swarm",
    kicker: "Chapter 3 of 3 · The Security Swarm",
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

/** Figure caption per frame: a bold lead, then one plain sentence. Frame 0 and the closing frame lead with "Figure." */
export const FRAME_CAPTIONS: ReadonlyArray<{ lead: string; text: string }> = [
  { lead: "Figure.", text: "Eight rings, one per swap detail." },
  { lead: "Chapter 1 of 3.", text: "The base is the QEVRA smart account. It is separate from your connected wallet." },
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
  { ref: "Security Swarm · reads", note: "Reads public sources only: papers, advisories, standards and repositories. Nothing private.", parts: ["swarm"], rows: { swarm: [0] } },
  { ref: "Security Swarm · runs", note: "Runs named tests in isolated sandboxes that hold no production secrets.", parts: ["swarm"], rows: { swarm: [1] } },
  { ref: "Security Swarm · writes", note: "Writes reports with their sources and limits. They go to Human review, the one path that exists.", parts: ["swarm", "review"], rows: { swarm: [2], review: [2] }, report: true },
  { ref: "Security Swarm · writes", note: "A proposed fix is a patch on a development branch. It reaches a person the same way a report does.", parts: ["swarm", "review"], rows: { swarm: [2], review: [2] }, report: true },
];

export const SWARM_CANNOT_FOCUS: readonly SwarmFocus[] = [
  { ref: "Security Swarm · holds, Your wallet · keys", note: "Holds no keys: no private keys, post-quantum keys, seed phrases or signing sessions.", parts: ["swarm", "wallet"], rows: { swarm: [3], wallet: [1] } },
  { ref: "Security Swarm · can sign, Your wallet · signs", note: "Can sign nothing. Signing stays with you, only you.", parts: ["swarm", "wallet"], rows: { swarm: [4], wallet: [0] } },
  { ref: "Air gap · Your wallet · Swarm", note: "No path crosses the air gap, so production contracts are out of the Swarm's reach.", parts: ["gap", "wallet"], rows: { wallet: [2] } },
  { ref: "Air gap · Your wallet · Swarm", note: "Signers, recovery rules, router allowlists and spending limits are out of its reach too.", parts: ["gap", "wallet"], rows: { wallet: [2, 3] } },
  { ref: "Human review · needs, decides", note: "A fix is merged only after passing tests, a security review and explicit human approval.", parts: ["review"], rows: { review: [1, 3, 4] } },
];

export const SWARM_DEFAULT_NOTE = "Scroll the list, or select a part of the diagram, to read what it can do and what it cannot.";

export const GAP_FIGURE_TITLE =
  "Three cards: Security Swarm, Human review, and Your wallet. Reports pass from the Swarm to Human review. Nothing passes from the Swarm to your wallet, and the span between them is marked as an air gap.";
export const GAP_FIGURE_CAPTION =
  "Reports reach a human review dock. The Swarm has no path to your keys, your signing, or your funds.";

export const STATUS_BAND_INTRO =
  "Nothing on this page is implemented. This table says what each part is meant to become, and how much is known about it now.";
