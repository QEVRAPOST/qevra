import { PqNote } from "@/components/ui/PqNote";
import { FOOTER_PREVIEW, FOOTER_ROBINHOOD } from "@/lib/content/copy-lock";
import { STATUS_BAND_INTRO } from "@/lib/content/landing";
import { COVERAGE_ROWS } from "@/lib/content/status";
import { LaunchLink } from "./LaunchLink";
import { StatusLedger } from "./StatusLedger";
import { SwarmExplainer } from "./SwarmExplainer";

/** Band 1: what the Swarm can and cannot do, as a pinned walkthrough beside the diagram. */
export function SwarmLimitsBand() {
  return (
    <section className="band swsec" id="swarm-limits" aria-labelledby="h-limits">
      <div className="wrap wide">
        <SwarmExplainer />
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
        <StatusLedger rows={COVERAGE_ROWS} caption="Status of each part of QEVRA" />
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
