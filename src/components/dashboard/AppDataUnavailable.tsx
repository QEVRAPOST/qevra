import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBar } from "@/components/ui/StatusBar";
import { STATUS_BAR_ITEMS } from "@/lib/content/status";

/**
 * Shown under /app when example data is switched off (NEXT_PUBLIC_QEVRA_DEMO_DATA=off) and no live provider
 * exists. It says what is true and what did not happen, and shows nothing that looks like data.
 */
export function AppDataUnavailable() {
  return (
    <>
      <StatusBar items={STATUS_BAR_ITEMS} />
      <main className="wrap wide notice-page" id="main" tabIndex={-1}>
        <div className="rhead">
          <h1>The app is not connected</h1>
          <p>Wallet, chain and Security Swarm data are not available in this build, and the example data is switched off.</p>
        </div>
        <EmptyState title="Nothing is shown here.">
          No wallet is connected, no chain is read and nothing here can move funds. This is not a statement about whether the system is safe.
        </EmptyState>
        <p>
          <Link className="btn ghost" href="/">
            Back to the landing page
          </Link>
        </p>
      </main>
    </>
  );
}
