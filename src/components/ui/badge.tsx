import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Badge, in the Aperture look: a mono label in a hairline box. The variant is the status tone:
 * `exp` experimental, `unk` unknown (dotted), `ok` a deterministic test that passed (lime, reserved), `bad`, `demo`.
 */
const badgeVariants = cva(
  "inline-flex min-h-[26px] shrink-0 items-center gap-2 rounded-md border px-2.5 font-mono text-xs leading-none whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      variant: {
        neutral: "border-line-2 text-fg-2",
        exp: "border-exp text-exp",
        unk: "border-dotted border-line-2 text-muted-foreground",
        ok: "border-pass text-pass",
        bad: "border-fail text-fail",
        demo: "border-foreground tracking-[0.04em] text-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
