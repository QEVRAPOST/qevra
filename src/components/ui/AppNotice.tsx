import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";

/**
 * A full-page message under /app: the app is not connected, a live service is unavailable, or access is needed.
 * It says what is true and what did not happen, always offers the way back to the landing page, and takes an optional
 * action (a retry, a sign-in form) as children. `busy` marks the checking state for assistive technology.
 */
export function AppNotice({
  title,
  lead,
  busy = false,
  tone = "info",
  children,
}: {
  title: string;
  lead: React.ReactNode;
  busy?: boolean;
  tone?: "info" | "problem";
  children?: React.ReactNode;
}) {
  return (
    <main className={`wrap wide notice-page notice-${tone}`} id="main" tabIndex={-1} aria-busy={busy || undefined}>
      <div className="rhead">
        <h1>{title}</h1>
        <p>{lead}</p>
      </div>
      {busy ? (
        <p className="notice-busy" role="status">
          <span className="mat m-outline" aria-hidden="true" /> Checking. Nothing is shown until the service answers.
        </p>
      ) : null}
      {children}
      <p className="notice-back">
        <Link className={buttonVariants({ variant: "ghost" })} href="/">
          Back to the landing page
        </Link>
      </p>
    </main>
  );
}
