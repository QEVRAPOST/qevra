import type { SwapSeverity } from "@/types";

/** Says what is true (the cause) and what did not happen. role="status" announces changes politely. */
export function StateCard({ severity, cause, notDone }: { severity: SwapSeverity; cause: string; notDone: string }) {
  return (
    <div className="statecard" data-sev={severity} role="status">
      <span className="glyph" aria-hidden="true" />
      <div>
        <p className="cause">{cause}</p>
        <p className="not">{notDone}</p>
      </div>
    </div>
  );
}
