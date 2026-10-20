"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { WordmarkMark } from "@/components/ui/Wordmark";
import { PROJECT_NAME } from "@/lib/project-brand";
import { CommandNav, TabBar } from "./AppNav";
import { useAppModel } from "./DemoAppProvider";
import { ModeMenu } from "./ModeMenu";
import { NetworkSelect } from "./NetworkSelect";

/**
 * The frame around every route: one header (brand, route bar, what kind of data this is, network, wallet) and a phone tab bar.
 * There is no sidebar: the work gets the full width, and the route bar keeps the way around one glance wide.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { model, actions } = useAppModel();
  const label = model.wallet.walletButtonLabel;
  return (
    <>
      <header className="apptop" data-sticky-nav>
        <div className="wrap wide">
          <Link href="/" className="wordmark" aria-label={`${PROJECT_NAME}, back to the landing page`} title="Back to the landing page">
            <span className="mark" aria-hidden="true">
              <WordmarkMark />
            </span>
            <span className="wm-t">{PROJECT_NAME}</span>
          </Link>
          <CommandNav />
          <div className="apptools">
            <ModeMenu />
            <NetworkSelect />
            <Button variant="ghost" size="small" className="walbtn" onClick={actions.pressWalletButton}>
              <svg className="wl-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <rect x="3" y="6" width="18" height="13" rx="2" />
                <path d="M3 10h18M16 14.5h2" />
              </svg>
              {/* a phone's bar has room for the icon only; display:none keeps just the shown name in the accessible name */}
              <span className="wl-full">{label}</span>
              <span className="wl-short">{label.replace(/ wallet$/i, "")}</span>
              <span className="wl-icon-name">{label}</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="wsmain" id="main" tabIndex={-1}>
        {children}
      </main>
      <TabBar />
    </>
  );
}
