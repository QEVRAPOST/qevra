"use client";

import Link from "next/link";
import { ArrowIcon } from "@/components/ui/ArrowIcon";
import { useLaunch } from "./LaunchCurtain";

interface LaunchLinkProps {
  /** extra classes after "btn primary" */
  className?: string;
  size?: "default" | "small";
  children?: React.ReactNode;
}

/** The Launch App button: a real link to /app that the curtain transition enhances. */
export function LaunchLink({ className, size = "default", children = "Launch App" }: LaunchLinkProps) {
  const api = useLaunch();
  const cls = ["btn", "primary", size === "small" ? "small" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <Link
      href="/app"
      className={cls}
      onClick={(e) => {
        /* let the browser handle new-tab and modified clicks */
        if (!api || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        api.launch(e.currentTarget, "/app");
      }}
    >
      {children}
      <ArrowIcon />
    </Link>
  );
}
