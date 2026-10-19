import { PQC_RULE, PQ_NOTE, PQ_NOTE_APP, PQ_NOTE_LEAD } from "@/lib/content/copy-lock";
import { brandizeProjectName, PROJECT_NAME } from "@/lib/project-brand";

/** The post-quantum note (dashed box). The landing also carries the PQC-protected rule. */
export function PqNote({ variant, flush = false }: { variant: "landing" | "app"; flush?: boolean }) {
  return (
    <div className="pqnote" style={flush ? { marginTop: 0 } : undefined}>
      <p>
        <b>{brandizeProjectName(PQ_NOTE_LEAD, PROJECT_NAME)}</b>{" "}
        {brandizeProjectName(variant === "landing" ? PQ_NOTE : PQ_NOTE_APP, PROJECT_NAME)}
      </p>
      {variant === "landing" ? <p>{brandizeProjectName(PQC_RULE, PROJECT_NAME)}</p> : null}
    </div>
  );
}
