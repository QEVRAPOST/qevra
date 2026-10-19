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
  /** how thick the slab is: the depth of the block each card stands on */
  d: number;
  pos: Record<Card, { x: number; y: number }>;
}

const WIDE: Layout = { w: 800, h: 344, cw: 204, head: 40, row: 34, ch: 40 + 34 * 5 + 4, d: 10, pos: { swarm: { x: 6, y: 30 }, review: { x: 294, y: 30 }, wallet: { x: 582, y: 30 } } };
const NARROW: Layout = { w: 350, h: 668, cw: 286, head: 36, row: 26, ch: 36 + 26 * 5 + 4, d: 8, pos: { swarm: { x: 8, y: 16 }, review: { x: 8, y: 252 }, wallet: { x: 8, y: 488 } } };

/** The icon in a card's header: 16 by 16, drawn with the card's own colour. */
function Glyph({ id, x, y }: { id: Card; x: number; y: number }) {
  return (
    <g className="gico" transform={`translate(${x} ${y})`} fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {id === "swarm" ? (
        <>
          <circle cx="8" cy="8" r="2" />
          <ellipse cx="8" cy="8" rx="7" ry="3.2" transform="rotate(-25 8 8)" strokeDasharray="2 2" />
          <circle cx="14" cy="4.8" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="2.4" cy="10.8" r="1.1" fill="currentColor" stroke="none" />
        </>
      ) : id === "review" ? (
        <>
          <path d="M2 9l2-5.5h8L14 9v4H2z" />
          <path d="M2 9h3.6l1.1 1.6h2.6L10.4 9H14" />
        </>
      ) : (
        <>
          <rect x="1.5" y="3.5" width="13" height="9.5" rx="1.5" />
          <path d="M1.5 6.6h13" />
          <circle cx="11.6" cy="9.9" r="1" fill="currentColor" stroke="none" />
        </>
      )}
    </g>
  );
}

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
  const { w, h, cw, pos, head: HEAD, row: ROW, ch: CARD_H, d: D } = layout;
  const rowY = (c: Card, i: number) => pos[c].y + HEAD + ROW * i + ROW / 2 + 4;
  const reportOn = sel === "swarm" || sel === "review" || (!sel && !!focus?.report);
  const crossOn = sel === "wallet" || sel === "gap" || (!sel && !!focus?.parts.includes("gap"));
  const gapOn = sel === "gap" || (!sel && !!focus?.parts.includes("gap"));
  const hlRow = (c: Card, i: number) => !sel && !!focus?.rows[c]?.includes(i);

  /* the path that exists: Swarm "writes" to Human review "receives". The path that does not: review to wallet. */
  const bx = pos.swarm.x + 52;
  const sy = pos.swarm.y + CARD_H;
  const rvTop = pos.review.y;
  const report = vertical ? `M${bx} ${sy + 2} V${rvTop - 12}` : `M${pos.swarm.x + cw + 2} ${rowY("swarm", 2)} H${pos.review.x - 12}`;
  const arrowEnd = vertical ? ([bx, rvTop - 3] as const) : ([pos.review.x - 3, rowY("swarm", 2)] as const);
  const arrow = vertical
    ? `${arrowEnd[0] - 6},${arrowEnd[1] - 11} ${arrowEnd[0]},${arrowEnd[1]} ${arrowEnd[0] + 6},${arrowEnd[1] - 11}`
    : `${arrowEnd[0] - 11},${arrowEnd[1] - 6} ${arrowEnd[0]},${arrowEnd[1]} ${arrowEnd[0] - 11},${arrowEnd[1] + 6}`;
  const nope = vertical
    ? `M${bx} ${pos.review.y + CARD_H + 2} V${pos.wallet.y - 2}`
    : `M${pos.review.x + cw + 2} ${rowY("review", 2)} H${pos.wallet.x - 2}`;
  const rx = vertical ? bx : (pos.swarm.x + cw + pos.review.x) / 2;
  const ry = vertical ? (sy + rvTop) / 2 : rowY("swarm", 2);
  const nx = vertical ? bx : (pos.review.x + cw + pos.wallet.x) / 2;
  const ny = vertical ? (pos.review.y + CARD_H + pos.wallet.y) / 2 : rowY("review", 2);
  /* a label sits in a small pill, so it reads against whatever line is behind it */
  const pill = (cx: number, cy: number, text: string, left = false) => {
    const tw = text.length * 6.3 + 14;
    const x0 = left ? cx : cx - tw / 2;
    return (
      <g className="gpillg">
        <rect className="gpl" x={x0} y={cy - 9} width={tw} height="18" rx="9" />
        <text className="glabel" x={x0 + tw / 2} y={cy + 4} textAnchor="middle" stroke="none" fill="currentColor">
          {text}
        </text>
      </g>
    );
  };

  /* the air gap spans from the Swarm to the wallet, under (or beside) Human review */
  const gy = pos.swarm.y + CARD_H + 46;
  const gx0 = pos.swarm.x + cw;
  const gx1 = pos.wallet.x;
  const gapHit = vertical
    ? { x: w - 50, y: pos.swarm.y + 10, width: 48, height: pos.wallet.y - pos.swarm.y + 60 }
    : { x: gx0 - 4, y: gy - 24, width: gx1 - gx0 + 8, height: 70 };
  const gapBand = vertical ? { x: w - 40, y: pos.swarm.y + 44, width: 22, height: pos.wallet.y - pos.swarm.y } : { x: gx0, y: gy - 15, width: gx1 - gx0, height: 30 };

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
        <linearGradient id={`${idp}-card`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "color-mix(in srgb, var(--fg) 8%, var(--bg-2))" }} />
          <stop offset="1" style={{ stopColor: "var(--bg)" }} />
        </linearGradient>
        <linearGradient id={`${idp}-pipe`} x1="0" y1="0" x2={vertical ? "0" : "1"} y2={vertical ? "1" : "0"}>
          <stop offset="0" style={{ stopColor: "var(--exp)" }} />
          <stop offset="1" style={{ stopColor: "var(--fg-2)" }} />
        </linearGradient>
        <radialGradient id={`${idp}-floor`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="rgb(255,233,184)" stopOpacity="0.1" />
          <stop offset="1" stopColor="rgb(255,233,184)" stopOpacity="0" />
        </radialGradient>
        <pattern id={`${idp}-hatch`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0V8" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.2" />
        </pattern>
      </defs>

      {/* the floor the cards stand on: a pool of light and two engraved rings, as under the objects at the top of the page */}
      {vertical ? null : (
        <g className="gfloor" aria-hidden="true" stroke="none">
          <ellipse cx={w / 2} cy={pos.swarm.y + CARD_H + 18} rx={w * 0.5} ry="74" fill={`url(#${idp}-floor)`} />
          <ellipse cx={w / 2} cy={pos.swarm.y + CARD_H + 18} rx={w * 0.47} ry="46" fill="none" stroke="var(--line)" strokeWidth="1" />
          <ellipse cx={w / 2} cy={pos.swarm.y + CARD_H + 18} rx={w * 0.37} ry="32" fill="none" stroke="var(--line)" strokeWidth="1" strokeOpacity="0.6" />
        </g>
      )}

      {CARDS.map((c, ci) => {
        const { x, y } = pos[c.id];
        const dash = c.dashed ? "4 3" : undefined;
        const tw = c.tag.length * 6.1 + 13;
        return (
          <g key={c.id} className={`${cls(c.id)} gcard`} style={{ ["--i" as string]: ci }} {...handlers(c.id)}>
            {/* contact shadow, then the slab: a top face and a side face give the card thickness */}
            <ellipse className="gshadow" cx={x + cw / 2 + D / 2} cy={y + CARD_H + 5} rx={cw / 2 + 8} ry="6.5" stroke="none" />
            <polygon className="gface gtop" points={`${x},${y} ${x + D},${y - D} ${x + cw + D},${y - D} ${x + cw},${y}`} strokeDasharray={dash} />
            <polygon className="gface gside" points={`${x + cw},${y} ${x + cw + D},${y - D} ${x + cw + D},${y + CARD_H - D} ${x + cw},${y + CARD_H}`} strokeDasharray={dash} />
            <rect className="gbox" x={x} y={y} width={cw} height={CARD_H} fill={`url(#${idp}-card)`} strokeDasharray={dash} />
            <path className="gsep" d={`M${x} ${y + HEAD}H${x + cw}`} />
            <Glyph id={c.id} x={x + 13} y={y + (HEAD - 16) / 2} />
            <text className="gtitle" x={x + 34} y={y + HEAD / 2 + 4.5} stroke="none" fill="currentColor">
              {c.title}
            </text>
            <rect className="gtagbox" x={x + cw - 12 - tw} y={y + (HEAD - 18) / 2} width={tw} height="18" rx="9" strokeDasharray={c.dashed ? "2 2" : undefined} />
            <text className="gtag" x={x + cw - 12 - tw / 2} y={y + HEAD / 2 + 3.6} textAnchor="middle" stroke="none" fill="currentColor">
              {c.tag}
            </text>
            {c.rows.map(([k, v], ri) => (
              <g key={k + ri} className={hlRow(c.id, ri) ? "grow hl" : "grow"} style={{ ["--r" as string]: ri }}>
                <rect className={ri % 2 ? "grow-bg z" : "grow-bg"} x={x + 4} y={y + HEAD + ROW * ri + 1} width={cw - 8} height={ROW - 2} rx="1.5" stroke="none" />
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
        <path className="pipe-back" d={report} />
        <path className="draw pipe" d={report} pathLength="1" stroke={`url(#${idp}-pipe)`} />
        <path className="flow" d={report} />
        <polygon className="pipe-head" points={arrow} />
        {[0, 1, 2].map((k) => (
          <g key={k} className={vertical ? "packet v" : "packet"} style={{ ["--pd" as string]: `${1800 + k * 1200}ms` }}>
            <circle cx={vertical ? bx : pos.swarm.x + cw + 6} cy={vertical ? sy + 6 : ry} r="6.5" className="packet-halo" />
            <circle cx={vertical ? bx : pos.swarm.x + cw + 6} cy={vertical ? sy + 6 : ry} r="3" className="packet-dot" />
          </g>
        ))}
        {pill(vertical ? rx + 12 : rx, vertical ? ry : ry - 18, "reports", vertical)}
      </g>

      {/* no path from Human review to the wallet: dotted and crossed out, drawn once, never a flow */}
      <g className={crossOn ? "gedge cross on" : "gedge cross"} aria-hidden="true" style={{ ["--e" as string]: 1 }}>
        <path className="dotted" d={nope} strokeDasharray="2 3" />
        <circle className="xbadge" cx={nx} cy={ny} r="10" />
        <path className="x" d={`M${nx - 4.5} ${ny - 4.5}l9 9M${nx + 4.5} ${ny - 4.5}l-9 9`} pathLength="1" />
        {pill(vertical ? nx + 16 : nx, vertical ? ny : ny + 26, "no path", vertical)}
      </g>

      {/* the air gap: the whole span from the Swarm to the wallet, drawn as a hatched strip of empty floor */}
      <g className={cls("gap")} {...handlers("gap")}>
        <rect className="hit" {...gapHit} stroke="none" />
        <g className={gapOn ? "gapline on" : "gapline"} style={{ ["--e" as string]: 2 }}>
          {vertical ? null : <path className="gdrop" d={`M${gx0} ${sy}V${gapBand.y}M${gx1} ${pos.wallet.y + CARD_H}V${gapBand.y}`} strokeDasharray="2 3" opacity=".5" />}
          <rect className="gband" {...gapBand} fill={`url(#${idp}-hatch)`} />
          <path className="gtick" d={vertical ? `M${gapBand.x} ${gapBand.y}h${gapBand.width}M${gapBand.x} ${gapBand.y + gapBand.height}h${gapBand.width}` : `M${gx0} ${gapBand.y - 4}v${gapBand.height + 8}M${gx1} ${gapBand.y - 4}v${gapBand.height + 8}`} />
        </g>
        {vertical ? (
          <text className="glabel gl2" transform={`rotate(-90 ${w - 8} ${gapBand.y + gapBand.height / 2})`} x={w - 8} y={gapBand.y + gapBand.height / 2} textAnchor="middle" stroke="none" fill="currentColor">
            air gap · no execution or signing path
          </text>
        ) : (
          <text className="glabel gl2" x={(gx0 + gx1) / 2} y={gy + 36} textAnchor="middle" stroke="none" fill="currentColor">
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
