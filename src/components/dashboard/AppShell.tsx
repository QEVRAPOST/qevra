"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { WordmarkMark } from "@/components/ui/Wordmark";
import { PROJECT_NAME } from "@/lib/project-brand";
import { useMediaQuery } from "@/lib/use-media-query";
import { CommandNav, TabBar } from "./AppNav";
import { useAppModel } from "./DemoAppProvider";
import { ModeMenu } from "./ModeMenu";
import { AuthEntryControl } from "@/components/auth/AuthEntryControl";
import { SocialXLink } from "@/components/ui/SocialXLink";

/**
 * The frame around every route: one header (brand, route bar, account and wallet) and a phone tab bar.
 * There is no sidebar: the work gets the full width, and the route bar keeps the way around one glance wide.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { model, actions } = useAppModel();
  const label = model.wallet.walletButtonLabel;
  const walletPending = model.mode === "live" && model.wallet.connection?.status === "loading";
  /* on a phone the header keeps the brand and wallet; what kind of data this is sits in a strip at the top of the page */
  const phone = useMediaQuery("(max-width: 700px)");
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
            <SocialXLink />
            <AuthEntryControl />
            {phone ? null : <ModeMenu />}
            <Button variant="ghost" size="small" className="walbtn" onClick={actions.pressWalletButton} disabled={walletPending}>
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
        {phone ? (
          <div className="mm-strip">
            <ModeMenu />
          </div>
        ) : null}
        {children}
      </main>
      <TabBar />
    </>
  );
}
