import type { Material } from "@/types";

/** The 11px status circle: solid = evidenced, outline = experimental, dotted = unknown. Always pair it with a word. */
export function StatusMaterial({ material, className }: { material: Material; className?: string }) {
  return <span className={className ? `mat ${material} ${className}` : `mat ${material}`} aria-hidden="true" />;
}
