import type { CoverageRow } from "@/types";
import { cn } from "@/lib/utils";
import { Chip } from "./Chip";
import { ScrollRegion } from "./ScrollRegion";
import { StatusMaterial } from "./StatusMaterial";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

/**
 * Coverage table (Part, Status, Note), on the shadcn Table. The landing ledger and the Status route render the same
 * data. `ledger` indents the cells to sit inside a Card and draws the status circle before the part name.
 */
export function CoverageTable({ rows, caption, ledger = false }: { rows: readonly CoverageRow[]; caption: string; ledger?: boolean }) {
  const pad = ledger ? "px-4" : "pl-0";
  return (
    <ScrollRegion className="overflow-x-auto" label={caption}>
      <Table className="min-w-[560px]">
        <caption className="sr">{caption}</caption>
        <TableHeader>
          <TableRow className="border-t-0 hover:bg-transparent">
            <TableHead scope="col" className={cn("border-b border-line-2", pad)}>
              Part
            </TableHead>
            <TableHead scope="col" className={cn("border-b border-line-2", pad)}>
              Status
            </TableHead>
            <TableHead scope="col" className={cn("border-b border-line-2", pad)}>
              Note
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className={ledger ? "" : "hover:bg-transparent"}>
              <TableCell className={cn("font-medium whitespace-nowrap", pad)}>
                {ledger ? (
                  <span className="inline-flex items-center gap-2.5">
                    <StatusMaterial material={r.material} className="text-muted-foreground" />
                    {r.part}
                  </span>
                ) : (
                  r.part
                )}
              </TableCell>
              <TableCell className={cn("whitespace-nowrap", pad)}>
                <Chip tone={r.tone} material={r.material}>
                  {r.statusLabel}
                </Chip>
              </TableCell>
              <TableCell className={cn("text-fg-2", pad)}>
                {r.note}
                {r.evidenceHref ? (
                  <>
                    {" "}
                    <a href={r.evidenceHref}>Evidence</a>
                  </>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollRegion>
  );
}
