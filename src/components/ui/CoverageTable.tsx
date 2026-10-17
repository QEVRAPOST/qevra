import type { CoverageRow } from "@/types";
import { Chip } from "./Chip";
import { ScrollRegion } from "./ScrollRegion";

/** Coverage table (Part, Status, Note). The landing and the Status route render the same data. */
export function CoverageTable({ rows, caption }: { rows: readonly CoverageRow[]; caption: string }) {
  return (
    <ScrollRegion className="covwrap" label={caption}>
      <table className="cov">
        <caption className="sr">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Part</th>
            <th scope="col">Status</th>
            <th scope="col">Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="k">{r.part}</td>
              <td className="s">
                <Chip tone={r.tone} material={r.material}>
                  {r.statusLabel}
                </Chip>
              </td>
              <td className="n">
                {r.note}
                {r.evidenceHref ? (
                  <>
                    {" "}
                    <a href={r.evidenceHref}>Evidence</a>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}
