"use client";

import { ToggleGroup as Group, ToggleGroupItem } from "./toggle-group";

interface ToggleOption<T extends string | number> {
  value: T;
  label: string;
  /** listed but cannot be chosen (for example a filter with nothing in it) */
  disabled?: boolean;
}

interface ToggleGroupProps<T extends string | number> {
  options: ReadonlyArray<ToggleOption<T>>;
  /** the chosen value, or null when none is chosen */
  value: T | null;
  onChange: (value: T) => void;
  /** accessible name for the group */
  label?: string;
  labelledBy?: string;
}

/** A single-choice group of buttons, on the shadcn ToggleGroup. Choosing the one already chosen keeps it chosen. */
export function ToggleGroup<T extends string | number>({ options, value, onChange, label, labelledBy }: ToggleGroupProps<T>) {
  return (
    <Group
      type="single"
      value={value == null ? "" : String(value)}
      onValueChange={(v) => {
        const o = options.find((x) => String(x.value) === v);
        if (o) onChange(o.value);
      }}
      aria-label={label}
      aria-labelledby={labelledBy}
    >
      {options.map((o) => (
        <ToggleGroupItem key={String(o.value)} value={String(o.value)} disabled={o.disabled}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </Group>
  );
}
