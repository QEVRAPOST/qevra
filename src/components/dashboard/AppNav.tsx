"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RouteIcon, APP_ROUTES } from "./routes";
import { useAppModel } from "./DemoAppProvider";
import { PROJECT_NAME } from "@/lib/project-brand";

/** `/app` is the overview and only matches itself; every other route also matches its sub-paths. */
function isCurrent(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Left rail on desktop (1025px and up). Hidden by CSS at 1024px and below, where the tab bar shows. */
export function Rail() {
  const pathname = usePathname();
  const { model } = useAppModel();
  const done = model.wallet.setupDone;
  return (
    <nav className="rail" aria-label="App sections">
      <ul>
        {APP_ROUTES.map((r) => (
          <li key={r.key}>
            <Link href={r.href} aria-current={isCurrent(pathname, r.href) ? "page" : undefined}>
              <RouteIcon route={r} size={18} />
              <span className="rl">
                {r.label}
                <small>{r.kind}</small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="setupmini">
        {model.mode === "demo" ? (
          <>
            <span>Setup: {done} of 4</span>
            <span className="bar" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <i key={i} className={i < done ? "on" : ""} />
              ))}
            </span>
            {done < 4 ? <Link href="/app/wallet">Continue setup</Link> : <span>Example account funded</span>}
          </>
        ) : (
            <span>Live mode · read-only · no {PROJECT_NAME} account</span>
        )}
      </div>
      <Link className="rail-home" href="/">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <path d="M10 3 5 8l5 5" />
        </svg>
        Landing page
      </Link>
    </nav>
  );
}

/** Bottom tab bar at 1024px and below. */
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="App sections">
      {APP_ROUTES.map((r) => (
        <Link key={r.key} href={r.href} aria-current={isCurrent(pathname, r.href) ? "page" : undefined}>
          <RouteIcon route={r} size={20} />
          <span>{r.short}</span>
        </Link>
      ))}
    </nav>
  );
}
