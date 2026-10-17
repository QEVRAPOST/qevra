"use client";

interface ToggleOption<T extends string | number> {
  value: T;
  label: string;
}

interface ToggleGroupProps<T extends string | number> {
  options: ReadonlyArray<ToggleOption<T>>;
  /** the pressed value, or null when none is pressed */
  value: T | null;
  onChange: (value: T) => void;
  /** accessible name for the group */
  label?: string;
  labelledBy?: string;
}

/** A group of toggle buttons. The pressed button carries aria-pressed and is filled. */
export function ToggleGroup<T extends string | number>({ options, value, onChange, label, labelledBy }: ToggleGroupProps<T>) {
  return (
    <span className="tg" role="group" aria-label={label} aria-labelledby={labelledBy}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </span>
  );
}
