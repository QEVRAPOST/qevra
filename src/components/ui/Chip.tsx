import type { Material, Tone } from "@/types";
import { Badge } from "./badge";
import { StatusMaterial } from "./StatusMaterial";

/** Tone names are the app's; the Badge variants are the same words, `neutral` being the plain one. */
interface ChipProps {
  tone?: Tone;
  /** status material shown before the label. Omit for DEMO DATA and EXAMPLE chips. */
  material?: Material;
  id?: string;
  className?: string;
  children: React.ReactNode;
}

/** `ok` (lime) is reserved for a deterministic test that actually passed. Components never decide a tone. A shadcn Badge underneath. */
export function Chip({ tone = "neutral", material, id, className, children }: ChipProps) {
  return (
    <Badge variant={tone} id={id} className={className}>
      {material ? <StatusMaterial material={material} /> : null}
      {children}
    </Badge>
  );
}

/** DEMO DATA, EXAMPLE, EXAMPLE RUNS and EXAMPLE ROWS labels. */
export function DemoChip({ children = "DEMO DATA" }: { children?: React.ReactNode }) {
  return <Badge variant="demo">{children}</Badge>;
}
