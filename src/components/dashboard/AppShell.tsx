"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusBar } from "@/components/ui/StatusBar";
import { WordmarkMark } from "@/components/ui/Wordmark";
import { PROJECT_NAME } from "@/lib/project-brand";
import { Rail, TabBar } from "./AppNav";
import { DemoBar } from "./DemoBar";
import { useAppModel } from "./DemoAppProvider";
import { LiveBar } from "./LiveBar";
import { NetworkSelect } from "./NetworkSelect";

/** Status bar, top bar, rail, demo or live bar, and tab bar around every dashboard route. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { model, actions } = useAppModel();
  return (
    <>
      <StatusBar items={model.statusBar} wrap />
      <header className="apptop" data-sticky-nav>
        <div className="wrap wide">
          <Link href="/" className="wordmark" aria-label={`${PROJECT_NAME}, back to the landing page`} title="Back to the landing page">
            <span className="mark" aria-hidden="true">
              <WordmarkMark />
            </span>
            {PROJECT_NAME}
          </Link>
          <div className="apptools">
            <NetworkSelect />
            <Button variant="ghost" size="small" onClick={actions.pressWalletButton}>
              {/* a phone's top bar has room for one word; display:none keeps only the shown one in the accessible name */}
              <span className="wl-full">{model.wallet.walletButtonLabel}</span>
              <span className="wl-short">{model.wallet.walletButtonLabel.replace(/ wallet$/i, "")}</span>
            </Button>
          </div>
        </div>
      </header>
      <div className="appshell">
        <Rail />
        <main className="appmain" id="main" tabIndex={-1}>
          {model.mode === "demo" ? <DemoBar /> : <LiveBar />}
          {children}
        </main>
      </div>
      <TabBar />
    </>
  );
}
