import { PQC_RULE, PQ_NOTE, PQ_NOTE_APP, PQ_NOTE_LEAD } from "@/lib/content/copy-lock";

/** The post-quantum note (dashed box). The landing also carries the PQC-protected rule. */
export function PqNote({ variant, flush = false }: { variant: "landing" | "app"; flush?: boolean }) {
  return (
    <div className="pqnote" style={flush ? { marginTop: 0 } : undefined}>
      <p>
        <b>{PQ_NOTE_LEAD}</b> {variant === "landing" ? PQ_NOTE : PQ_NOTE_APP}
      </p>
      {variant === "landing" ? <p>{PQC_RULE}</p> : null}
    </div>
  );
}
