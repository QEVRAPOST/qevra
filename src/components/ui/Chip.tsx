import type { Material, Tone } from "@/types";
import { StatusMaterial } from "./StatusMaterial";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "chip",
  exp: "chip exp",
  unk: "chip unk",
  ok: "chip ok",
  bad: "chip bad",
  demo: "chip demo",
};

interface ChipProps {
  tone?: Tone;
  /** status material shown before the label. Omit for DEMO DATA and EXAMPLE chips. */
  material?: Material;
  id?: string;
  className?: string;
  children: React.ReactNode;
}

/** `ok` (lime) is reserved for a deterministic test that actually passed. Components never decide a tone. */
export function Chip({ tone = "neutral", material, id, className, children }: ChipProps) {
  const cls = className ? `${TONE_CLASS[tone]} ${className}` : TONE_CLASS[tone];
  return (
    <span className={cls} id={id}>
      {material ? <StatusMaterial material={material} /> : null}
      {children}
    </span>
  );
}

/** DEMO DATA, EXAMPLE, EXAMPLE RUNS and EXAMPLE ROWS labels. */
export function DemoChip({ children = "DEMO DATA" }: { children?: React.ReactNode }) {
  return <span className="chip demo">{children}</span>;
}
