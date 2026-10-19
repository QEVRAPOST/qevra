import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Button, in the Aperture look.
 * `default` (alias `primary`) is the filled call to action; `ghost` is the bordered button the design calls ghost
 * (it is shadcn's `outline`, kept under the approved name); `quiet` has no border. Real <button> elements: a disabled
 * button is truly disabled. Use `asChild` (or `buttonVariants`) to give a link the same look. The `btn` class carries no
 * style: it is only the hook the page layouts use to place a button (`.lnav .btn`, `.ctas .btn`).
 */
const variants = cva(
  "btn inline-flex shrink-0 cursor-pointer items-center justify-center gap-2.5 rounded-md border border-transparent font-sans font-medium leading-none whitespace-nowrap no-underline select-none transition-[background-color,color,border-color,transform] duration-[var(--t)] ease-[var(--ease)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground hover:-translate-y-px active:translate-y-0",
        primary: "border-primary bg-primary text-primary-foreground hover:-translate-y-px active:translate-y-0",
        ghost: "border-input bg-transparent text-foreground hover:border-foreground",
        outline: "border-input bg-transparent text-foreground hover:border-foreground",
        quiet: "bg-transparent text-muted-foreground hover:text-foreground",
        link: "text-foreground underline underline-offset-4 hover:text-fg-2",
      },
      size: {
        default: "min-h-11 px-5 text-[15px]",
        small: "min-h-9 px-3.5 text-sm",
        icon: "size-9 text-sm",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

/** The variant classes, with twMerge applied so `border-input` wins over the base `border-transparent` even when used as a bare className. */
function buttonVariants(options?: VariantProps<typeof variants>): string {
  return cn(variants(options));
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" type={asChild ? undefined : (type ?? "button")} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
