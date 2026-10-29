import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PqNote } from "@/components/ui/PqNote";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brandizeProjectName } from "@/lib/project-brand";
import { SwarmExplainer } from "./SwarmExplainer";

const LANDING_CAPABILITIES = [
  {
    feature: "VEYRA Account and Wallet Access",
    experience: "Sign in separately, then connect an external EVM wallet to view its authorized address, actual network and public native balance.",
    action: "Open wallet",
    href: "/app/wallet",
  },
  {
    feature: "Robinhood Mainnet Swap Quotes",
    experience: "Request a live 0x quote for supported assets when service configuration, network checks and route liquidity permit.",
    action: "Explore quotes",
    href: "/app/swap",
  },
  {
    feature: "Intent Review",
    experience: "Review the quoted route, output, slippage and gas before explicit wallet approval. A quote is not a confirmed trade.",
    action: "Review intent",
    href: "/app/swap",
  },
  {
    feature: "AI Security Swarm",
    experience: "Follow Research → Analysis → Verification through saved, source-backed findings. New runs depend on authorization and service readiness.",
    action: "Open Security Swarm",
    href: "/app/security",
  },
  {
    feature: "Human Review and Research Evidence",
    experience: "Reopen findings, sources, limitations and run events; record a personal evidence assessment when review is available.",
    action: "View evidence",
    href: "/app/security",
  },
  {
    feature: "Network and Contract Explorer",
    experience: "Inspect public Robinhood network status and chain-specific VEYRA deployment records with explorer evidence.",
    action: "Explore networks",
    href: "/app/networks",
  },
] as const;

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
export function ProductJourneysBand({ projectName }: { projectName: string }) {
  return (
    <section className="band product-overview" id="product-journeys" aria-labelledby="h-product-journeys">
      <div className="wrap wide">
        <header className="bhead product-overview-head">
          <p className="product-overview-eyebrow">A connected product, with clear boundaries</p>
          <h2 id="h-product-journeys">Connect. Review. Research.</h2>
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
      </div>
    </section>
  );
}

/** Band 3: product capabilities and their destinations, separate from the technical Status page. */
export function CapabilityBand({ projectName }: { projectName: string }) {
  return (
    <section className="band capability-band" id="status" aria-labelledby="h-capabilities">
      <div className="wrap wide">
        <header className="bhead product-overview-head">
          <p className="product-overview-eyebrow">Explore the product</p>
          <h2 id="h-capabilities">One workspace for informed decisions.</h2>
          <p className="sub">
            {brandizeProjectName("Explore wallet access, Mainnet swap quotes, Intent Review and source-backed security research, with clear boundaries at every step.", projectName)}
          </p>
        </header>

        <Card className="landing-capabilities-card">
          <CardHeader>
            <CardTitle>Product capabilities</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollRegion className="landing-capability-scroll overflow-x-auto" label="VEYRA product capabilities">
              <Table className="landing-capabilities-table min-w-[720px]">
                <caption className="sr">VEYRA product features, experiences and application pages</caption>
                <TableHeader>
                  <TableRow className="border-t-0 hover:bg-transparent">
                    <TableHead scope="col" className="border-b border-line-2">Feature</TableHead>
                    <TableHead scope="col" className="border-b border-line-2">Experience</TableHead>
                    <TableHead scope="col" className="border-b border-line-2">Explore</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {LANDING_CAPABILITIES.map((capability) => (
                    <TableRow key={capability.feature}>
                      <TableCell className="landing-capability-feature font-medium text-foreground">
                        {brandizeProjectName(capability.feature, projectName)}
                      </TableCell>
                      <TableCell className="landing-capability-experience text-fg-2">
                        {brandizeProjectName(capability.experience, projectName)}
                      </TableCell>
                      <TableCell className="landing-capability-action">
                        <Link className="product-journey-link" href={capability.href}>
                          {capability.action}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollRegion>
          </CardContent>
          <CardFooter className="landing-capability-disclosure">
            <p>Live quotes depend on service availability, network checks and liquidity. Wallet transactions require explicit approval; research is not an independent audit.</p>
            <Link className="product-status-link" href="/app/protocol">Open technical status</Link>
          </CardFooter>
        </Card>
      </div>
    </section>
  );
}

/** Band 4: post-quantum research is visible as an experiment, separate from transaction guarantees. */
export function PostQuantumBand({ projectName }: { projectName: string }) {
  return (
    <section className="band post-quantum-band" id="post-quantum-research" aria-labelledby="h-post-quantum">
      <div className="wrap wide">
        <header className="bhead product-overview-head">
          <p className="product-overview-eyebrow">Experimental cryptography</p>
          <h2 id="h-post-quantum">Post-quantum research</h2>
        </header>
        <div className="product-overview-foot">
          <div className="product-pq-note">
            <p>{brandizeProjectName("Browser-local ML-DSA can attest to a reviewed intent. It does not authorize a wallet transaction or enforce post-quantum custody on-chain.", projectName)}</p>
          </div>
          <div className="product-overview-actions">
            <PqNote variant="landing" />
            <Link className="product-status-link" href="/app/protocol">Explore technical status</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
