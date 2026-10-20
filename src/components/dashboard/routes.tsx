/**
 * The dashboard routes, in the order a first-time visitor needs them: where to start, the Security Swarm, then the rest.
 * `status` is labelled "Status" and lives at /app/protocol (docs/QEVRA_DESIGN_DIRECTION.md section 10, item 3).
 * `/app` itself is the overview.
 */
export interface AppRoute {
  key: "overview" | "security" | "wallet" | "swap" | "activity" | "status";
  href: string;
  label: string;
  short: string;
  /** what kind of thing this is, in two or three words, shown under the name in the rail */
  kind: string;
  /** SVG path markup, 24px grid, 1.5 stroke */
  icon: React.ReactNode;
}

export const APP_ROUTES: readonly AppRoute[] = [
  {
    key: "overview",
    href: "/app",
    label: "Overview",
    short: "Start",
    kind: "Start here",
    icon: (
      <>
        <rect x="3.5" y="3.5" width="7" height="7" />
        <rect x="13.5" y="3.5" width="7" height="7" />
        <rect x="3.5" y="13.5" width="7" height="7" />
        <path d="M13.5 17h7M17 13.5v7" />
      </>
    ),
  },
  {
    key: "security",
    href: "/app/security",
    label: "Security Swarm",
    short: "Swarm",
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
    kind: "Read-only",
    icon: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M16 14.5h2" />
      </>
    ),
  },
  { key: "swap", href: "/app/swap", label: "Swap", short: "Swap", kind: "Preview, switched off", icon: <path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4" /> },
  { key: "activity", href: "/app/activity", label: "Activity", short: "Activity", kind: "Runs and transactions", icon: <path d="M4 7h16M4 12h16M4 17h10" /> },
  {
    key: "status",
    href: "/app/protocol",
    label: "Status",
    short: "Status",
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
