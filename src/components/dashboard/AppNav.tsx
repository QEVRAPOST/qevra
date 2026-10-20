"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { APP_ROUTES, RouteIcon } from "./routes";

/** `/app` is the overview and only matches itself; every other route also matches its sub-paths. */
function isCurrent(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The route bar in the header (1100px and up). One thin amber line slides to the route you are on, so moving between
 * routes reads as moving, not as a page swap. Below 1100px the tab bar takes over.
 */
export function CommandNav() {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);
  /* the first placement must not animate in from nowhere */
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const place = () => {
      const nav = ref.current;
      const cur = nav?.querySelector<HTMLElement>('a[aria-current="page"]');
      if (!nav || !cur) return setBar(null);
      setBar({ x: cur.offsetLeft, w: cur.offsetWidth });
    };
    place();
    const raf = requestAnimationFrame(() => setReady(true));
    window.addEventListener("resize", place);
    document.fonts?.ready.then(place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
    };
  }, [pathname]);

  return (
    <nav className="cnav" aria-label="App sections" ref={ref}>
      {APP_ROUTES.map((r) => (
        <Link key={r.key} href={r.href} aria-current={isCurrent(pathname, r.href) ? "page" : undefined} title={r.kind}>
          {r.nav}
        </Link>
      ))}
      <span className={`cnav-bar${ready ? " go" : ""}`} aria-hidden="true" style={bar ? { width: bar.w, transform: `translateX(${bar.x}px)`, opacity: 1 } : { opacity: 0 }} />
    </nav>
  );
}

/** Bottom tab bar below 1100px. */
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
