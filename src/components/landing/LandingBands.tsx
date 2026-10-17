import { CoverageTable } from "@/components/ui/CoverageTable";
import { PqNote } from "@/components/ui/PqNote";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { FOOTER_PREVIEW, FOOTER_ROBINHOOD, SWARM_PARAGRAPH_A, SWARM_PARAGRAPH_B } from "@/lib/content/copy-lock";
import { GAP_FIGURE_CAPTION, GAP_FIGURE_TITLE, STATUS_BAND_INTRO, SWARM_CAN, SWARM_CANNOT } from "@/lib/content/landing";
import { COVERAGE_ROWS } from "@/lib/content/status";
import { LaunchLink } from "./LaunchLink";

/** Inline figure: Swarm, Human review, Your wallet, with the air gap marked. */
function GapFigure() {
  return (
    <figure className="gapfig">
      <svg viewBox="0 0 520 112" role="img" aria-labelledby="gap-t" fill="none" stroke="currentColor" strokeWidth="1.3">
        <title id="gap-t">{GAP_FIGURE_TITLE}</title>
        <rect x="2" y="10" width="150" height="52" />
        <text x="77" y="32" textAnchor="middle" fill="currentColor" stroke="none" fontSize="13" fontWeight="500">Security Swarm</text>
        <text x="77" y="49" textAnchor="middle" fill="currentColor" stroke="none" fontSize="10.5" opacity=".72">no keys · cannot sign</text>
        <rect x="186" y="10" width="148" height="52" strokeDasharray="3 3" />
        <text x="260" y="32" textAnchor="middle" fill="currentColor" stroke="none" fontSize="13" fontWeight="500">Human review</text>
        <text x="260" y="49" textAnchor="middle" fill="currentColor" stroke="none" fontSize="10.5" opacity=".72">dock unlit in this preview</text>
        <rect x="368" y="10" width="150" height="52" />
        <text x="443" y="32" textAnchor="middle" fill="currentColor" stroke="none" fontSize="13" fontWeight="500">Your wallet</text>
        <text x="443" y="49" textAnchor="middle" fill="currentColor" stroke="none" fontSize="10.5" opacity=".72">you sign, only you</text>
        <path d="M154 36h26M176 32l5 4-5 4" />
        <path d="M336 36h30" strokeDasharray="2 3" opacity=".55" />
        <path d="M345 30l12 12M357 30l-12 12" opacity=".7" strokeWidth="1.6" />
        <path d="M154 86h212M154 80v12M366 80v12" opacity=".6" />
        <text x="260" y="106" textAnchor="middle" fill="currentColor" stroke="none" fontSize="11" opacity=".8">air gap</text>
      </svg>
      <figcaption>{GAP_FIGURE_CAPTION}</figcaption>
    </figure>
  );
}

/** Band 1: what the Swarm can and cannot do. */
export function SwarmLimitsBand() {
  return (
    <section className="band" id="swarm-limits" aria-labelledby="h-limits">
      <div className="wrap wide">
        <div className="bgrid">
          <div className="bhead">
            <h2 id="h-limits">What the Swarm can and cannot do</h2>
            <p className="sub">{SWARM_PARAGRAPH_A}</p>
            <p className="sub">{SWARM_PARAGRAPH_B}</p>
          </div>
          <div>
            <div className="can2">
              <div>
                <h3>
                  <StatusMaterial material="outline" />
                  It can
                </h3>
                <ul>
                  {SWARM_CAN.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>
                  <StatusMaterial material="solid" />
                  It cannot
                </h3>
                <ul>
                  {SWARM_CANNOT.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            </div>
            <GapFigure />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Band 2: what is real today. */
export function StatusBand() {
  return (
    <section className="band" id="status" aria-labelledby="h-status">
      <div className="wrap wide">
        <div className="bhead" style={{ marginBottom: 36 }}>
          <h2 id="h-status">What is real today</h2>
          <p className="sub">{STATUS_BAND_INTRO}</p>
        </div>
        <CoverageTable rows={COVERAGE_ROWS} caption="Status of each part of QEVRA" />
        <PqNote variant="landing" />
        <div className="ctas" style={{ marginTop: 36 }}>
          <LaunchLink>Launch App</LaunchLink>
        </div>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="lfoot">
      <div className="wrap wide">
        <p>{FOOTER_PREVIEW}</p>
        <p>{FOOTER_ROBINHOOD}</p>
      </div>
    </footer>
  );
}
