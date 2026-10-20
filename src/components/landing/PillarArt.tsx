"use client";

import { useState, type CSSProperties } from "react";
import { ToggleGroup } from "@/components/ui/ToggleGroup";
import { LOCK_DETAILS } from "@/lib/content/pillars";

/** Where on the build timeline (0 to 1) a piece of an illustration is drawn: it starts at `s` and is complete at `e`. See pillars.css. */
const w = (s: number, e: number): CSSProperties => ({ ["--s" as string]: s, ["--e" as string]: e });

type AccountView = "wallet" | "account";

/**
 * The separation, drawn piece by piece as the section's build value rises: the wallet plate, then the account vessel on its own, its gate of
 * rules, the lattice of post-quantum research, the line that keeps the two apart, and last the deposit path, shown as blocked. Every outline is
 * an example, and nothing here moves between the two. With no timeline (the default) it is the complete drawing.
 */
export function AccountArt({ projectName }: { projectName: string }) {
  const [view, setView] = useState<AccountView>("account");
  return (
    <div className="pl-art pl-account" data-view={view}>
      <svg viewBox="0 0 540 300" role="img" aria-label={`Two separate things. Your connected wallet, drawn as a flat plate, and the ${projectName} smart account, drawn as a vessel with a gate for authorization rules. A dotted, crossed line between them: no deposit path exists yet.`} focusable="false">
        {/* the lattice: post-quantum signatures, under research */}
        <g className="pa-lattice">
          {[0, 1, 2, 3].map((r) =>
            [0, 1, 2, 3, 4].map((c) => {
              const s = 0.62 + (r * 5 + c) * 0.008;
              return <circle key={`${r}-${c}`} className="bf" style={w(s, s + 0.06)} cx={346 + c * 20} cy={34 + r * 14} r="2" />;
            }),
          )}
          <text className="pa-t sm bt" style={w(0.76, 0.84)} x="386" y="104" textAnchor="middle">post-quantum: under research</text>
        </g>

        {/* the line that keeps them apart */}
        <g className="pa-divg">
          <path className="pa-div bd" pathLength={1} style={w(0.74, 0.84)} d="M264 30 V160" />
          <path className="pa-div bd" pathLength={1} style={w(0.78, 0.88)} d="M264 252 V292" />
        </g>

        {/* the wallet plate */}
        <g className="pa-wallet">
          <path className="pa-plate bd" pathLength={1} style={w(0.02, 0.18)} d="M36 176 L188 150 L214 190 L62 218 Z" />
          <path className="pa-line bd" pathLength={1} style={w(0.14, 0.22)} d="M74 186 L170 168 M80 198 L150 185" />
          <text className="pa-t bt" style={w(0.18, 0.26)} x="124" y="248" textAnchor="middle">Your wallet</text>
          <text className="pa-t sm bt" style={w(0.2, 0.28)} x="124" y="266" textAnchor="middle">signs as before</text>
        </g>

        {/* the link that does not exist */}
        <g className="pa-linkg">
          <path className="pa-link bc" style={w(0.84, 0.93)} d="M216 190 C 252 184 276 196 312 190" />
          <path className="pa-x bd" pathLength={1} style={w(0.92, 0.98)} d="M254 180 L274 200 M274 180 L254 200" />
          <text className="pa-t sm bt" style={w(0.94, 1)} x="264" y="224" textAnchor="middle">no deposit</text>
          <text className="pa-t sm bt" style={w(0.94, 1)} x="264" y="238" textAnchor="middle">path yet</text>
        </g>

        {/* the smart account vessel */}
        <g className="pa-vessel">
          <rect className="pa-box bd" pathLength={1} style={w(0.22, 0.42)} x="316" y="124" width="190" height="104" rx="6" />
          <circle className="pa-slot bf" style={w(0.38, 0.46)} cx="364" cy="176" r="18" />
          <circle className="pa-slot bf" style={w(0.42, 0.5)} cx="410" cy="176" r="18" />
          <circle className="pa-slot bf" style={w(0.46, 0.54)} cx="456" cy="176" r="18" />
          <path className="pa-gate bd" pathLength={1} style={w(0.5, 0.6)} d="M316 160 h-16 a10 10 0 0 1 0 -20 h16" />
          <text className="pa-t sm gate bt" style={w(0.56, 0.64)} x="306" y="132" textAnchor="end">rules</text>
          <text className="pa-t bt" style={w(0.44, 0.52)} x="411" y="252" textAnchor="middle">{projectName} smart account</text>
          <text className="pa-t sm bt" style={w(0.48, 0.56)} x="411" y="270" textAnchor="middle">holds nothing</text>
        </g>
      </svg>
      <div className="pl-art-ctl bh" style={w(0.9, 0.98)}>
        <ToggleGroup
          label="Look at"
          value={view}
          onChange={setView}
          options={[
            { value: "wallet", label: "Your wallet" },
            { value: "account", label: "Smart account" },
          ]}
        />
        <p className="pl-art-note" key={view}>
          {view === "wallet"
            ? `The wallet you connect stays what it is. ${projectName} makes no protection claim for it.`
            : "A separate address with its own authorization rules. It is a design: nothing is built, and nothing can be deposited."}
        </p>
      </div>
    </div>
  );
}

/** The detail the scroll-driven demonstration changes: Recipient. */
const DEMO_DETAIL = 2;

/**
 * Intent Lock, built and then demonstrated. The rail is drawn, the six details are set on it two at a time, and a line of light sweeps across the
 * ones that match. Then (when `demo` is on) one detail is changed on its own, and the light stops there, which is the whole point of the lock. The
 * visitor can press any detail to change it themselves; that takes over from the demonstration. All values are examples, and nothing is signed.
 */
export function LockArt({ demo = false }: { demo?: boolean }) {
  const [changed, setChanged] = useState<boolean[]>(() => LOCK_DETAILS.map(() => false));
  const [touched, setTouched] = useState(false);
  const shown = changed.map((v, i) => v || (demo && !touched && i === DEMO_DETAIL));
  const first = shown.findIndex(Boolean);
  const count = shown.filter(Boolean).length;
  const lit = first === -1 ? 1 : (first + 0.5) / LOCK_DETAILS.length;
  const flip = (i: number) => {
    setTouched(true);
    setChanged((c) => c.map((v, k) => (k === i ? !v : v)));
  };
  /* pins are set on the rail two at a time */
  const pinWindow = (i: number): CSSProperties => w(0.14 + Math.floor(i / 2) * 0.16 + (i % 2) * 0.04, 0.26 + Math.floor(i / 2) * 0.16 + (i % 2) * 0.04);
  return (
    <div className="pl-art pl-lock" style={{ ["--lit" as string]: lit }}>
      <ol className="lk" aria-label="Details Intent Lock reviews">
        <span className="lk-beam bk" style={w(0.02, 0.14)} aria-hidden="true">
          <i className="bk" style={w(0.64, 0.82)} />
        </span>
        <span className="lk-lamp bh" style={w(0.1, 0.16)} aria-hidden="true" />
        {LOCK_DETAILS.map((d, i) => (
          <li key={d} className="bh bk" style={pinWindow(i)}>
            <button type="button" className={`lk-pin${shown[i] ? " off" : ""}`} aria-pressed={shown[i]} onClick={() => flip(i)}>
              <span className="lk-slot" aria-hidden="true">
                <b />
              </span>
              <span className="lk-name">{d}</span>
              <span className="lk-state">{shown[i] ? "Changed" : "Same"}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="pl-art-ctl bh" style={w(0.6, 0.72)}>
        <p className="pl-art-note" role="status">
          {count === 0
            ? "Every detail matches what was reviewed, so the light passes. Press a detail to change it."
            : demo && !touched
              ? `Demonstration: ${LOCK_DETAILS[first]} changed after review. The light stops here, and the swap goes back to review.`
              : `${LOCK_DETAILS[first]} changed: the light stops here, and the swap goes back to review.`}
        </p>
        {count > 0 ? (
          <button
            type="button"
            className="pl-reset"
            onClick={() => {
              setTouched(true);
              setChanged(LOCK_DETAILS.map(() => false));
            }}
          >
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}
