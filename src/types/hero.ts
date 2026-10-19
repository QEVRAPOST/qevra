/** Every part of the three hero objects that can be pointed at, clicked and zoomed on. A scene may only register one of these. */
export type HeroPartId =
  /* 1. the smart account */
  | "v-wallet"
  | "v-account"
  | "v-assets"
  | "v-link"
  /* 2. Intent Lock */
  | "t-recipient"
  | "t-chain"
  | "t-token"
  | "t-amount"
  | "t-deadline"
  | "t-lamp"
  | "t-receiver"
  /* 3. post-quantum research and the Security Swarm */
  | "l-coord"
  | "l-a-research"
  | "l-a-analysis"
  | "l-a-verify"
  | "l-a-risk"
  | "l-a-policy"
  | "l-a-report"
  | "l-ring"
  | "l-lattice"
  | "l-dock"
  | "l-gap"
  | "l-wallet";

/** What the hero says about one part of an object. Edit the words in `lib/content/landing.ts` (`HERO_PARTS`); the scenes only name the part. */
export interface HeroPart {
  /** its name: the lead of the caption under the stage, and the title of the note on the stage */
  name: string;
  /** a sentence or two, for the caption under the stage */
  text: string;
  /** what kind of thing it is, as a short type: "address", "uint256", "orchestrator" */
  type: string;
  /** the note drawn beside the part when it is zoomed on: one to three short lines, about 40 characters each */
  brief: readonly string[];
}
