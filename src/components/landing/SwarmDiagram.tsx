"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { prefersReducedMotion } from "@/lib/aperture/motion";
import { GAP_FIGURE_CAPTION, GAP_FIGURE_TITLE, SWARM_DEFAULT_NOTE, type SwarmFocus } from "@/lib/content/landing";

type Part = "swarm" | "review" | "wallet" | "gap";
type Card = Exclude<Part, "gap">;

interface PartInfo {
  name: string;
  /** one short line under the name */
  role: string;
  text: string;
  /** the relationship this part has, stated plainly */
  relation: string;
}

/** Plain-language descriptions. They restate the PM brief (sections 5.4, 6, 7): they add no claim about what exists. */
const PARTS: Record<Part, PartInfo> = {
  swarm: {
    name: "Security Swarm",
    role: "researches, tests, reports",
    text: "Agents may read public sources, run named tests in isolated sandboxes that hold no production secrets, and write reports that list their evidence and their limits. They hold no keys and cannot sign.",
    relation: "Permitted path: reports go to Human review. Nothing else leaves the Swarm.",
  },
  review: {
    name: "Human review",
    role: "a person decides",
    text: "Findings and proposed changes reach a review dock. A change needs passing deterministic tests, an appropriate security review and explicit human approval before it is deployed. In this preview the dock is unlit: no review has been recorded.",
    relation: "Receives reports from the Swarm. Has no automatic path to your wallet either.",
  },
  wallet: {
    name: "Your wallet",
    role: "you sign, only you",
    text: "The wallet sits behind a boundary the Swarm cannot cross. Agents have no authority to access private keys, sign transactions or move funds. Signing stays with you.",
    relation: "No connection from the Swarm. The crossed line is a path that does not exist.",
  },
  gap: {
    name: "Air gap",
    role: "no execution or signing path",
    text: "There is no execution or signing connection between the Swarm and your wallet. The gap is a design boundary, not a promise that nothing can go wrong. Independent review is still needed before any mainnet use.",
    relation: "Marks the whole span from the Swarm to your wallet, with Human review in between.",
  },
};

/** Parts that light up softly with the selected one. */
const RELATED: Record<Part, Part[]> = {
  swarm: ["review"],
  review: ["swarm"],
  wallet: ["gap"],
  gap: ["swarm", "wallet"],
};

/**
 * The three cards, drawn like entities in a data diagram: a header, then one row per fact (a name and a value).
 * Row 2 of the Swarm ("writes") and of Human review ("receives") are the two ends of the one path that exists.
 */
interface CardDef {
  id: Card;
  title: string;
  tag: string;
  /** dashed outline: the part is not lit or recorded in this preview */
  dashed?: boolean;
  rows: ReadonlyArray<readonly [string, string]>;
}

const CARDS: readonly CardDef[] = [
  {
    id: "swarm",
    title: "Security Swarm",
    tag: "no keys",
    rows: [
      ["reads", "public sources"],
      ["runs", "sandboxed tests"],
      ["writes", "reports"],
      ["holds", "no keys"],
      ["can sign", "nothing"],
    ],
  },
  {
    id: "review",
    title: "Human review",
    tag: "unlit",
    dashed: true,
    rows: [
      ["status", "none recorded"],
      ["needs", "passing tests"],
      ["receives", "reports"],
      ["needs", "security review"],
      ["decides", "a person"],
    ],
  },
  {
    id: "wallet",
    title: "Your wallet",
    tag: "you sign",
    rows: [
      ["signs", "you, only you"],
      ["keys", "yours alone"],
      ["Swarm", "no access"],
      ["review", "no auto path"],
      ["funds", "you move them"],
    ],
  },
];


/** Where the cards go and where the paths between them run, for the wide layout (a row) and the narrow one (a column). */
interface Layout {
  w: number;
  h: number;
  cw: number;
  /** header height, row height, and the whole card's height (a header and five rows) */
  head: number;
  row: number;
  ch: number;
  pos: Record<Card, { x: number; y: number }>;
}

const WIDE: Layout = { w: 780, h: 336, cw: 204, head: 38, row: 32, ch: 38 + 32 * 5 + 4, pos: { swarm: { x: 4, y: 20 }, review: { x: 288, y: 20 }, wallet: { x: 572, y: 20 } } };
const NARROW: Layout = { w: 350, h: 650, cw: 292, head: 34, row: 26, ch: 34 + 26 * 5 + 4, pos: { swarm: { x: 8, y: 8 }, review: { x: 8, y: 244 }, wallet: { x: 8, y: 480 } } };

interface FigureProps {
  layout: Layout;
  vertical: boolean;
  idp: string;
  sel: Part | null;
  /** what the page is pointing at while nothing is selected (the list beside it, scrolled) */
  focus: SwarmFocus | null;
  cls: (p: Part) => string;
  handlers: (p: Part) => Record<string, unknown>;
  phase: string;
}

function Figure({ layout, vertical, idp, sel, focus, cls, handlers, phase }: FigureProps) {
  const { w, h, cw, pos, head: HEAD, row: ROW, ch: CARD_H } = layout;
  const rowY = (c: Card, i: number) => pos[c].y + HEAD + ROW * i + ROW / 2 + 4;
  const reportOn = sel === "swarm" || sel === "review" || (!sel && !!focus?.report);
  const crossOn = sel === "wallet" || sel === "gap" || (!sel && !!focus?.parts.includes("gap"));
  const gapOn = sel === "gap" || (!sel && !!focus?.parts.includes("gap"));
  const hlRow = (c: Card, i: number) => !sel && !!focus?.rows[c]?.includes(i);

  /* the path that exists: Swarm "writes" to Human review "receives". The path that does not: review to wallet. */
  const report = vertical
    ? `M${pos.swarm.x + 52} ${pos.swarm.y + CARD_H} V${pos.review.y - 6}`
    : `M${pos.swarm.x + cw} ${rowY("swarm", 2)} H${pos.review.x - 6}`;
  const nope = vertical
    ? `M${pos.review.x + 52} ${pos.review.y + CARD_H} V${pos.wallet.y - 2}`
    : `M${pos.review.x + cw} ${rowY("review", 2)} H${pos.wallet.x - 2}`;
  const rx = vertical ? pos.swarm.x + 52 : (pos.swarm.x + cw + pos.review.x) / 2;
  const ry = vertical ? (pos.swarm.y + CARD_H + pos.review.y) / 2 : rowY("swarm", 2);
  const nx = vertical ? pos.review.x + 52 : (pos.review.x + cw + pos.wallet.x) / 2;
  const ny = vertical ? (pos.review.y + CARD_H + pos.wallet.y) / 2 : rowY("review", 2);

  /* the air gap spans from the Swarm to the wallet, under (or beside) Human review */
  const gy = pos.swarm.y + CARD_H + 34;
  const gapPath = vertical ? `M${w - 24} ${pos.swarm.y + 40} V${pos.wallet.y + 40}` : `M${pos.swarm.x + cw} ${gy} H${pos.wallet.x}`;
  const gapTicks = vertical
    ? `M${w - 30} ${pos.swarm.y + 40}h12M${w - 30} ${pos.wallet.y + 40}h12`
    : `M${pos.swarm.x + cw} ${gy - 6}v12M${pos.wallet.x} ${gy - 6}v12`;
  const gapDrops = vertical
    ? ""
    : `M${pos.swarm.x + cw} ${pos.swarm.y + CARD_H}V${gy - 6}M${pos.wallet.x} ${pos.wallet.y + CARD_H}V${gy - 6}`;
  const gapHit = vertical
    ? { x: w - 46, y: pos.swarm.y + 20, width: 44, height: pos.wallet.y - pos.swarm.y + 40 }
    : { x: pos.swarm.x + cw - 4, y: gy - 22, width: pos.wallet.x - pos.swarm.x - cw + 8, height: 64 };

  return (
    <svg
      className={[vertical ? "gv" : "gw", sel || focus ? "sel" : "", phase].filter(Boolean).join(" ")}
      viewBox={`0 0 ${w} ${h}`}
      role="group"
      aria-labelledby={`${idp}-t`}
      aria-describedby="gap-panel"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <title id={`${idp}-t`}>{GAP_FIGURE_TITLE}</title>
      <defs>
        <marker id={`${idp}-ah`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M1 1.5L9 5L1 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      {CARDS.map((c, ci) => {
        const { x, y } = pos[c.id];
        return (
          <g key={c.id} className={`${cls(c.id)} gcard`} style={{ ["--i" as string]: ci }} {...handlers(c.id)}>
            <rect className="gbox" x={x} y={y} width={cw} height={CARD_H} strokeDasharray={c.dashed ? "4 3" : undefined} />
            <path className="gsep" d={`M${x} ${y + HEAD}H${x + cw}`} />
            <circle className={c.dashed ? "gdot dashed" : "gdot"} cx={x + 17} cy={y + HEAD / 2} r="4.5" />
            <text className="gtitle" x={x + 30} y={y + HEAD / 2 + 4.5} stroke="none" fill="currentColor">
              {c.title}
            </text>
            <text className="gtag" x={x + cw - 12} y={y + HEAD / 2 + 4} textAnchor="end" stroke="none" fill="currentColor">
              {c.tag}
            </text>
            {c.rows.map(([k, v], ri) => (
              <g key={k + ri} className={hlRow(c.id, ri) ? "grow hl" : "grow"} style={{ ["--r" as string]: ri }}>
                <rect className="grow-bg" x={x + 4} y={y + HEAD + ROW * ri + 1} width={cw - 8} height={ROW - 2} rx="1.5" stroke="none" />
                {ri > 0 ? <path className="gline" d={`M${x + 10} ${y + HEAD + ROW * ri}H${x + cw - 10}`} /> : null}
                <text className="gk" x={x + 14} y={rowY(c.id, ri)} stroke="none" fill="currentColor">
                  {k}
                </text>
                <text className="gval" x={x + 80} y={rowY(c.id, ri)} stroke="none" fill="currentColor">
                  {v}
                </text>
              </g>
            ))}
          </g>
        );
      })}

      {/* reports pass from the Swarm to Human review: this path exists, so it is the only one that flows */}
      <g className={reportOn ? "gedge link on" : "gedge link"} aria-hidden="true" style={{ ["--e" as string]: 0 }}>
        <path className="draw" d={report} pathLength="1" markerEnd={`url(#${idp}-ah)`} />
        <path className="flow" d={report} />
        <rect className={vertical ? "packet v" : "packet"} x={vertical ? rx - 4 : pos.swarm.x + cw + 2} y={vertical ? pos.swarm.y + CARD_H + 2 : ry - 4} width="8" height="8" rx="1.5" />
        <text className="glabel" x={vertical ? rx + 14 : rx} y={vertical ? ry + 4 : ry - 10} textAnchor={vertical ? "start" : "middle"} stroke="none" fill="currentColor">
          reports
        </text>
      </g>

      {/* no path from Human review to the wallet: dotted and crossed out, drawn once, never a flow */}
      <g className={crossOn ? "gedge cross on" : "gedge cross"} aria-hidden="true" style={{ ["--e" as string]: 1 }}>
        <path className="dotted" d={nope} strokeDasharray="2 3" />
        <path className="x" d={`M${nx - 6} ${ny - 6}l12 12M${nx + 6} ${ny - 6}l-12 12`} pathLength="1" />
        <text className="glabel" x={vertical ? nx + 14 : nx} y={vertical ? ny + 4 : ny + 22} textAnchor={vertical ? "start" : "middle"} stroke="none" fill="currentColor">
          no path
        </text>
      </g>

      {/* the air gap: the whole span from the Swarm to the wallet */}
      <g className={cls("gap")} {...handlers("gap")}>
        <rect className="hit" {...gapHit} stroke="none" />
        <g className={gapOn ? "gapline on" : "gapline"} style={{ ["--e" as string]: 2 }}>
          {gapDrops ? <path className="gdrop" d={gapDrops} strokeDasharray="2 3" opacity=".5" /> : null}
          <path className="draw" d={gapPath} pathLength="1" opacity=".75" />
          <path d={gapTicks} opacity=".75" />
        </g>
        {vertical ? (
          <text className="glabel gl2" transform={`rotate(-90 ${w - 8} ${(pos.swarm.y + pos.wallet.y) / 2 + 60})`} x={w - 8} y={(pos.swarm.y + pos.wallet.y) / 2 + 60} textAnchor="middle" stroke="none" fill="currentColor">
            air gap · no execution or signing path
          </text>
        ) : (
          <text className="glabel gl2" x={(pos.swarm.x + cw + pos.wallet.x) / 2} y={gy + 24} textAnchor="middle" stroke="none" fill="currentColor">
            air gap · no execution or signing path
          </text>
        )}
      </g>
    </svg>
  );
}

/**
 * The Security Swarm architecture, as an interactive figure drawn like a small data diagram: three cards, the one
 * path that exists, the one that does not, and the air gap across both.
 * Select a part (mouse, touch, or keyboard: Tab, then Enter or Space; Escape clears) to see what it can and cannot
 * do. Only relationships that exist are animated: the report flow from the Swarm to Human review. The missing
 * path to the wallet is never animated as a flow, only drawn as a crossed-out dotted line.
 * The figure draws itself in once, when it first comes into view (not at all under reduced motion).
 */
export function SwarmDiagram({ focus = null, focusKey = -1 }: { focus?: SwarmFocus | null; focusKey?: number }) {
  /* a selection belongs to the step it was made on: scrolling to another step hands the diagram back to the list */
  const [picked, setPicked] = useState<{ part: Part; at: number } | null>(null);
  const sel = picked && picked.at === focusKey ? picked.part : null;
  const setSel = (next: Part | null | ((cur: Part | null) => Part | null)) => {
    const part = typeof next === "function" ? next(sel) : next;
    setPicked(part ? { part, at: focusKey } : null);
  };
  /* "" renders everything (server, no JS, reduced motion); "arm" hides it, "in" plays the draw-in and "live" keeps the packet moving */
  const [phase, setPhase] = useState<"" | "arm" | "in">("");
  const [onScreen, setOnScreen] = useState(false);
  const figRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = figRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const rm = prefersReducedMotion();
    let armed = false;
    let seen = false;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.some((e) => e.isIntersecting);
        setOnScreen(vis);
        if (rm || seen) return;
        if (!armed) {
          armed = true;
          setPhase("arm");
        }
        if (vis) {
          seen = true;
          /* two frames in the hidden state first, so the transition has something to start from */
          requestAnimationFrame(() => requestAnimationFrame(() => setPhase("in")));
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const cls = (part: Part) => {
    if (!sel) {
      if (!focus) return "gp";
      return focus.parts.includes(part) ? "gp on" : "gp off";
    }
    if (sel === part) return "gp on";
    return RELATED[sel].includes(part) ? "gp rel" : "gp off";
  };
  const toggle = (part: Part) => setSel((cur) => (cur === part ? null : part));
  /* A card's name comes from its own text (WCAG 2.5.3: the visible label is part of the name). Only the air gap, a
     bracket with a short label, gets an explicit name. */
  const handlers = (part: Part) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-pressed": sel === part,
    ...(part === "gap" ? { "aria-label": "air gap, no execution or signing path. Select to read more." } : {}),
    onClick: () => toggle(part),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle(part);
      }
    },
  });
  const info = sel ? PARTS[sel] : null;
  const fphase = phase === "in" ? (onScreen ? "in live" : "in") : phase;

  return (
    <figure className="gapfig" ref={figRef} onKeyDown={(e) => e.key === "Escape" && setSel(null)}>
      <div className="gapbox">
        <Figure layout={WIDE} vertical={false} idp="gw" sel={sel} focus={focus} cls={cls} handlers={handlers} phase={fphase} />
        <Figure layout={NARROW} vertical idp="gn" sel={sel} focus={focus} cls={cls} handlers={handlers} phase={fphase} />
      </div>
      <p className="gleg" aria-hidden="true">
        <span className="k solid" />a path that exists in the design
        <span className="k dotted" />a path that does not
      </p>

      <div className="gapinfo" id="gap-panel" aria-live="polite">
        {info ? (
          <>
            <p className="gi-t">
              <StatusMaterial material={sel === "wallet" || sel === "gap" ? "solid" : "outline"} />
              <b>{info.name}</b>
              <span>{info.role}</span>
            </p>
            <p className="gi-b">{info.text}</p>
            <p className="gi-r">{info.relation}</p>
            <Button variant="ghost" size="small" onClick={() => setSel(null)}>
              Show the whole diagram
            </Button>
          </>
        ) : focus ? (
          <>
            <p className="gi-t">
              <StatusMaterial material={focus.parts.includes("gap") || focus.parts.includes("wallet") ? "solid" : "outline"} />
              <b>{focus.ref}</b>
            </p>
            <p className="gi-b">{focus.note}</p>
          </>
        ) : (
          <p className="gi-h">{SWARM_DEFAULT_NOTE}</p>
        )}
      </div>
      <figcaption>{GAP_FIGURE_CAPTION}</figcaption>
    </figure>
  );
}
