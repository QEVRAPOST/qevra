import type { Material } from "@/types";

/** The 11px status circle: solid = evidenced, outline = experimental, dotted = unknown. Always pair it with a word. */
export function StatusMaterial({ material, className }: { material: Material; className?: string }) {
  /* `m-` keeps the class clear of Tailwind's own `outline` utility */
  return <span className={className ? `mat m-${material} ${className}` : `mat m-${material}`} aria-hidden="true" />;
}
