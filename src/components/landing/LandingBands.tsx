import { CoverageTable } from "@/components/ui/CoverageTable";
import { PqNote } from "@/components/ui/PqNote";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { FOOTER_PREVIEW, FOOTER_ROBINHOOD, SWARM_PARAGRAPH_A, SWARM_PARAGRAPH_B } from "@/lib/content/copy-lock";
import { STATUS_BAND_INTRO, SWARM_CAN, SWARM_CANNOT } from "@/lib/content/landing";
import { COVERAGE_ROWS } from "@/lib/content/status";
import { LaunchLink } from "./LaunchLink";
import { SwarmDiagram } from "./SwarmDiagram";

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
            <SwarmDiagram />
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
