import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBar } from "@/components/ui/StatusBar";
import { STATUS_BAR_ITEMS } from "@/lib/content/status";

/** 404. Not designed in the prototype, so it is built only from existing parts: status bar, route heading, empty state. */
export default function NotFound() {
  return (
    <>
      <StatusBar items={STATUS_BAR_ITEMS} />
      <main id="main" tabIndex={-1} className="wrap wide notice-page">
        <div className="rhead">
          <h1>This page does not exist</h1>
          <p>The address may be mistyped, or the page may have moved.</p>
        </div>
        <EmptyState title="Nothing is here.">No wallet was contacted and no chain was read to look for this page.</EmptyState>
        <p className="ctas">
          <Link className="btn primary" href="/">
            Back to the landing page
          </Link>
          <Link className="btn ghost" href="/app">
            Open the app preview
          </Link>
        </p>
      </main>
    </>
  );
}
