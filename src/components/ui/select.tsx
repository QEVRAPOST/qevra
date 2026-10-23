"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** shadcn/ui Select (Radix), restyled with the Aperture tokens. It replaces the browser's own menu, which cannot be styled. */
const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-9 w-fit cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 font-sans text-sm whitespace-nowrap text-foreground transition-[background-color,border-color] duration-[var(--t-fast)] hover:border-foreground disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground data-[state=open]:border-foreground [&>span]:line-clamp-1 [&>span]:flex [&>span]:items-center [&>span]:gap-2",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-3.5 shrink-0 opacity-80 transition-transform duration-[var(--t-fast)] [[data-state=open]>&]:rotate-180" aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({ className, children, position = "popper", ...props }: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        sideOffset={6}
        align="end"
        className={cn(
          "relative z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border border-input bg-popover text-popover-foreground shadow-[0_14px_36px_rgba(0,0,0,0.6)] data-[state=closed]:animate-[ui-pop-out_100ms_ease-in] data-[state=open]:animate-[ui-pop-in_140ms_var(--ease)]",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return <SelectPrimitive.Label data-slot="select-label" className={cn("px-3 py-1.5 font-mono text-xs text-muted-foreground", className)} {...props} />;
}

function SelectItem({ className, children, hint, ...props }: React.ComponentProps<typeof SelectPrimitive.Item> & { hint?: React.ReactNode }) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-3 rounded-sm py-2 pr-9 pl-3 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:text-muted-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        className,
      )}
      /* the option's name includes its hint, not just the ItemText */
      aria-labelledby={undefined}
      {...props}
    >
      <span className="absolute right-3 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-3.5 text-exp" aria-hidden="true" />
        </SelectPrimitive.ItemIndicator>
      </span>
      {/* only the ItemText is shown in the closed trigger; the hint (a reason, for a disabled item) stays in the menu */}
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      {hint ? <span className="ml-auto font-mono text-[11px] text-muted-foreground">{hint}</span> : null}
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator data-slot="select-separator" className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue };
