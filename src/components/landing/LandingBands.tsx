import Link from "next/link";
import { PqNote } from "@/components/ui/PqNote";
import { brandizeProjectName } from "@/lib/project-brand";
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

/** Band 2: a product-led account of the three user journeys and their real boundaries. */
export function StatusBand({ projectName }: { projectName: string }) {
  return (
    <section className="band product-overview" id="status" aria-labelledby="h-status">
      <div className="wrap wide">
        <header className="bhead product-overview-head">
          <p className="product-overview-eyebrow">A connected product, with clear boundaries</p>
          <h2 id="h-status">Connect. Review. Research.</h2>
          <p className="sub">
            {brandizeProjectName(`${projectName} brings wallet reads, reviewable Mainnet swap intent and evidence-led security research into one workspace.`, projectName)}
          </p>
        </header>

        <ol className="product-journeys" aria-label="VEYRA product journeys">
          <li className="product-journey">
            <p className="product-journey-index">01 <span>Wallet access</span></p>
            <h3>Connect a wallet. Keep your account separate.</h3>
            <p>A supported external EVM wallet provides public address, actual network and native-balance reads. VEYRA Account email and password sign-in is separate and does not create a blockchain wallet.</p>
            <p className="product-journey-limit">Experimental ERC-4337 smart-account work is separate, Testnet-only and does not provide Mainnet custody or swaps.</p>
            <Link className="product-journey-link" href="/app/wallet">Explore Wallet</Link>
          </li>
          <li className="product-journey">
            <p className="product-journey-index">02 <span>Mainnet swap + Intent Lock</span></p>
            <h3>Review intent before wallet approval.</h3>
            <p>For supported Robinhood Mainnet assets, request a live 0x quote when service configuration, RPC checks and liquidity allow. Review the route, output, slippage and gas; each allowance or swap requires explicit external-wallet approval.</p>
            <p className="product-journey-limit">A quote or local intent check is not a confirmed transaction. No on-chain post-quantum enforcement is available.</p>
            <Link className="product-journey-link" href="/app/swap">Explore Swap</Link>
          </li>
          <li className="product-journey">
            <p className="product-journey-index">03 <span>VEYRA Research Engine</span></p>
            <h3>Research built to be reviewed.</h3>
            <p>The demonstrated Research → Analysis → Verification workflow examines approved public sources and saves findings, quotations and limitations. Report access depends on authorization; new runs also depend on provider, billing and worker availability.</p>
            <p className="product-journey-limit">Reports are model-assisted research, not independent audits or certifications.</p>
            <Link className="product-journey-link" href="/app/security">Explore Security Swarm</Link>
          </li>
        </ol>

        <div className="product-overview-foot">
          <div className="product-pq-note">
            <h3>Post-quantum research</h3>
            <p>Browser-local ML-DSA can create and verify an experimental signature bound to a reviewed intent. It is off-chain: it does not authorize a wallet transaction or enforce post-quantum custody on-chain.</p>
          </div>
          <div className="product-overview-actions">
            <PqNote variant="landing" />
            <Link className="product-status-link" href="/app/protocol">View technical status</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
