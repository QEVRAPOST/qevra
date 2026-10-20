/**
 * The dashboard routes, in the order a first-time visitor needs them: where to start, the Security Swarm, then the rest.
 * `status` is labelled "Status" and lives at /app/protocol (docs/QEVRA_DESIGN_DIRECTION.md section 10, item 3).
 * `/app` itself is the overview.
 */
export interface AppRoute {
  key: "overview" | "security" | "wallet" | "swap" | "activity" | "status";
  href: string;
  label: string;
  /** the label in the phone tab bar */
  short: string;
  /** the label in the header route bar */
  nav: string;
  /** what kind of thing this is, in two or three words (a tooltip in the route bar) */
  kind: string;
  /** SVG path markup, 24px grid, 1.5 stroke */
  icon: React.ReactNode;
}

export const APP_ROUTES: readonly AppRoute[] = [
  {
    key: "overview",
    href: "/app",
    label: "Overview",
    short: "Overview",
    nav: "Overview",
    kind: "Start here",
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="0.8" />
      </>
    ),
  },
  {
    key: "security",
    href: "/app/security",
    label: "Security Swarm",
    short: "Swarm",
    nav: "Security Swarm",
    kind: "Research only",
    icon: (
      <>
        <ellipse cx="12" cy="8" rx="7" ry="3" />
        <ellipse cx="12" cy="13" rx="8.5" ry="3.5" />
        <path d="M12 13v7" />
      </>
    ),
  },
  {
    key: "wallet",
    href: "/app/wallet",
    label: "Wallet and PQ Vault",
    short: "Wallet",
    nav: "Wallet",
    kind: "Read-only",
    icon: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M16 14.5h2" />
      </>
    ),
  },
  {
    key: "swap",
    href: "/app/swap",
    label: "Swap",
    short: "Swap",
    nav: "Swap",
    kind: "Preview, switched off",
    icon: <path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4" />,
  },
  {
    key: "activity",
    href: "/app/activity",
    label: "Activity",
    short: "Activity",
    nav: "Activity",
    kind: "Runs and transactions",
    icon: <path d="M4 7h16M4 12h16M4 17h10" />,
  },
  {
    key: "status",
    href: "/app/protocol",
    label: "Status",
    short: "Status",
    nav: "Status",
    kind: "What works today",
    icon: (
      <>
        <circle cx="12" cy="12" r="8" strokeDasharray="2 2.5" />
        <path d="M12 8v5M12 16v.5" />
      </>
    ),
  },
];

export function RouteIcon({ route, size }: { route: AppRoute; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {route.icon}
    </svg>
  );
}
