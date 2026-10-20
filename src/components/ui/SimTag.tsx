/**
 * The small mark on a simulated record where it appears on its own (a run in a list, a detail, a transaction row).
 * The environment indicator in the header says what kind of data the whole app shows; this keeps one record honest
 * if it is lifted out of that context, in a screenshot or a shared link.
 */
export function SimTag({ children = "Simulated" }: { children?: React.ReactNode }) {
  return <span className="simtag">{children}</span>;
}
