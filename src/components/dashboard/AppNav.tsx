"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { prefersReducedMotion } from "@/lib/aperture/motion";
import { useOverlay } from "@/lib/use-overlay";
import { APP_ROUTES, RouteIcon, type AppRoute } from "./routes";

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

/** The routes that live under "More" on a phone: the ones that are previews or explanations, not the daily ones. */
const MORE_KEYS: ReadonlyArray<AppRoute["key"]> = ["swap", "status"];

/**
 * The one navigation on a phone (below 1100px): five places you can reach with a thumb. Overview, the Security Swarm, the wallet and
 * the activity log are tabs; "More" opens a sheet with Swap and Status, and the way back to the landing page. The tab for the page you
 * are on is marked, and More is marked when the page is one of the two inside it.
 */
export function TabBar() {
  const pathname = usePathname();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const tabs = APP_ROUTES.filter((r) => !MORE_KEYS.includes(r.key));
  const inMore = APP_ROUTES.some((r) => MORE_KEYS.includes(r.key) && isCurrent(pathname, r.href));

  const openSheet = useCallback(() => {
    window.clearTimeout(timer.current);
    setShown(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
  }, []);
  const closeSheet = useCallback(() => {
    setOpen(false);
    timer.current = window.setTimeout(() => setShown(false), prefersReducedMotion() ? 0 : 260);
  }, []);
  useOverlay(open, closeSheet, sheet, { inertSelector: ".apptop, .wsmain", returnFocus: more });

  /* any route change closes the sheet, the browser's back button included (adjusted during render, once per path) */
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
    setShown(false);
  }
  /* so does the window growing past the phone layout */
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1100px)");
    const onChange = () => {
      if (mq.matches) {
        setOpen(false);
        setShown(false);
      }
    };
    mq.addEventListener("change", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      window.clearTimeout(timer.current);
    };
  }, []);

  const sheetId = `${uid}-more`;
  return (
    <>
      <nav className="tabbar" aria-label="App sections">
        {tabs.map((r) => (
          <Link key={r.key} href={r.href} aria-current={isCurrent(pathname, r.href) ? "page" : undefined}>
            <RouteIcon route={r} size={22} />
            <span>{r.short}</span>
          </Link>
        ))}
        <button ref={more} type="button" className="tab-more" data-active={inMore || undefined} aria-expanded={open} aria-controls={sheetId} aria-haspopup="dialog" onClick={openSheet}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <circle cx="5.5" cy="12" r="1.2" />
            <circle cx="12" cy="12" r="1.2" />
            <circle cx="18.5" cy="12" r="1.2" />
          </svg>
          <span>More</span>
        </button>
      </nav>

      {shown
        ? createPortal(
            <div className={`msheet${open ? " is-open" : ""}`} id={sheetId} role="dialog" aria-modal="true" aria-label="More of the app">
              <div className="msheet-scrim" onClick={closeSheet} aria-hidden="true" />
              <div className="msheet-panel" ref={sheet}>
                <span className="msheet-grip" aria-hidden="true" />
                <ul>
                  {APP_ROUTES.filter((r) => MORE_KEYS.includes(r.key)).map((r) => (
                    <li key={r.key}>
                      <Link href={r.href} aria-current={isCurrent(pathname, r.href) ? "page" : undefined} onClick={closeSheet}>
                        <RouteIcon route={r} size={22} />
                        <span className="msheet-t">
                          {r.label}
                          <small>{r.kind}</small>
                        </span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link className="msheet-home" href="/" onClick={closeSheet}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 5l-7 7 7 7" />
                  </svg>
                  Back to the landing page
                </Link>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
