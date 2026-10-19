"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

/** shadcn/ui Tooltip (Radix): a short name for an icon button, on hover and keyboard focus. */
function TooltipProvider({ delayDuration = 250, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({ className, sideOffset = 6, children, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-md border border-input bg-popover px-2.5 py-1.5 font-mono text-xs text-popover-foreground shadow-[0_8px_24px_rgba(0,0,0,0.5)] data-[state=closed]:animate-[ui-pop-out_80ms_ease-in] data-[state=delayed-open]:animate-[ui-pop-in_120ms_var(--ease)] data-[state=instant-open]:animate-[ui-pop-in_80ms_var(--ease)]",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
