/** The five dashboard routes. `status` is labelled "Status" and lives at /app/protocol (docs/QEVRA_DESIGN_DIRECTION.md section 10, item 3). */
export interface AppRoute {
  key: "swap" | "wallet" | "activity" | "security" | "status";
  href: string;
  label: string;
  short: string;
  /** SVG path markup, 24px grid, 1.5 stroke */
  icon: React.ReactNode;
}

export const APP_ROUTES: readonly AppRoute[] = [
  { key: "swap", href: "/app/swap", label: "Swap", short: "Swap", icon: <path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4" /> },
  {
    key: "wallet",
    href: "/app/wallet",
    label: "Wallet and PQ Vault",
    short: "Wallet",
    icon: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M16 14.5h2" />
      </>
    ),
  },
  { key: "activity", href: "/app/activity", label: "Activity", short: "Activity", icon: <path d="M4 7h16M4 12h16M4 17h10" /> },
  {
    key: "security",
    href: "/app/security",
    label: "Security Swarm",
    short: "Swarm",
    icon: (
      <>
        <ellipse cx="12" cy="8" rx="7" ry="3" />
        <ellipse cx="12" cy="13" rx="8.5" ry="3.5" />
        <path d="M12 13v7" />
      </>
    ),
  },
  {
    key: "status",
    href: "/app/protocol",
    label: "Status",
    short: "Status",
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
