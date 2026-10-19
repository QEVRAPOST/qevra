"use client";

import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/utils";

/** shadcn/ui ToggleGroup (Radix). A single-choice group is a radio group: arrow keys move between the choices. */
function ToggleGroup({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn("inline-flex flex-wrap gap-0.5 rounded-md border border-[var(--line-ctl)] p-0.5", className)}
      {...props}
    />
  );
}

function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "min-h-[30px] cursor-pointer rounded-[1px] bg-transparent px-3 font-sans text-[12.5px] font-medium leading-none text-fg-2 transition-colors duration-[var(--t-fast)] hover:text-foreground data-[state=on]:bg-foreground data-[state=on]:text-background disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-fg-2",
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
