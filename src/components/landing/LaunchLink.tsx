"use client";

import Link from "next/link";
import { ArrowIcon } from "@/components/ui/ArrowIcon";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useLaunch } from "./LaunchTransition";

interface LaunchLinkProps {
  /** extra classes after the primary button's own */
  className?: string;
  size?: "default" | "small";
  /** the route to open. The curtain transition runs for any of the app's routes. */
  href?: string;
  variant?: "default" | "ghost";
  /** called when the link starts the launch (the mobile menu closes itself) */
  onLaunch?: () => void;
  children?: React.ReactNode;
}

/** The Launch App button: a real link to /app that the curtain transition enhances. */
export function LaunchLink({ className, size = "default", href = "/app", variant = "default", onLaunch, children = "Launch App" }: LaunchLinkProps) {
  const api = useLaunch();
  const cls = cn(buttonVariants({ size, variant }), className);
  return (
    <Link
      href={href}
      className={cls}
      onClick={(e) => {
        /* let the browser handle new-tab and modified clicks */
        if (!api || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        api.launch(e.currentTarget, href);
        onLaunch?.();
      }}
    >
      {children}
      <ArrowIcon />
    </Link>
  );
}
