/*
 * The Three Pillars' one scroll timeline. `p` (0 to 1) is how far the visitor has scrolled through the pinned section; the section holds
 * three chapters of equal length. Each chapter's illustration has a build value `b` (0 = nothing drawn, 1 = complete) and every piece of the
 * illustration owns a window inside it (see pillars.css). A chapter builds during its own stretch, holds, and is taken apart again during the
 * first fifth of the next one, so scrolling up plays everything backwards. Pure functions: nothing here touches the page.
 */
export const CHAPTERS = 3;

const clamp = (v: number): number => Math.min(1, Math.max(0, v));

/** Where in a chapter the build starts and ends (as a share of the chapter's own scroll). The rest of it is hold. */
const BUILD_END = 0.74;
const BUILD_START_FIRST = 0.04;
/** the share of the next chapter during which this one is taken apart, and the next one starts building after it */
const DECONSTRUCT = 0.2;
/** the chapter changes (rail, text) a little into the next one's stretch */
const SWITCH_AT = 0.05;

export interface PillarFrame {
  /** build value of each illustration */
  b: [number, number, number];
  active: 0 | 1 | 2;
  /** progress of the active chapter, for the rail's amber line */
  pg: number;
}

export function pillarFrame(p: number): PillarFrame {
  const x = clamp(p) * CHAPTERS;
  const local = (c: number): number => clamp(x - c);
  const b = [0, 1, 2].map((c) => {
    const start = c === 0 ? BUILD_START_FIRST : DECONSTRUCT;
    const up = clamp((local(c) - start) / (BUILD_END - start));
    const down = c < CHAPTERS - 1 ? 1 - clamp(local(c + 1) / DECONSTRUCT) : 1;
    return Math.min(up, down);
  }) as [number, number, number];
  const active = Math.min(CHAPTERS - 1, Math.max(0, Math.floor(x - SWITCH_AT))) as 0 | 1 | 2;
  return { b, active, pg: clamp(local(active) / (BUILD_END + 0.06)) };
}

/** The scroll position (as p) that shows chapter c fully built: where a click on its heading goes. */
export const chapterTarget = (c: number): number => (c + BUILD_END + 0.06) / CHAPTERS;

/** The build value from which a chapter counts as built, so its controls can be used. */
export const READY_AT = 0.95;
/** Intent Lock's demonstration of a changed detail starts here. */
export const DEMO_AT = 0.9;
