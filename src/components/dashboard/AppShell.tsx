"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { StatusBar } from "@/components/ui/StatusBar";
import { WordmarkMark } from "@/components/ui/Wordmark";
import { Rail, TabBar } from "./AppNav";
import { DemoBar } from "./DemoBar";
import { useAppModel } from "./DemoAppProvider";

/** Status bar, top bar, rail, demo bar and tab bar around every dashboard route. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { model, actions } = useAppModel();
  return (
    <>
      <StatusBar items={model.statusBar} />
      <header className="apptop" data-sticky-nav>
        <div className="wrap wide">
          <Link href="/" className="wordmark" aria-label="QEVRA, back to the landing page">
            <span className="mark" aria-hidden="true">
              <WordmarkMark />
            </span>
            QEVRA
          </Link>
          <div className="apptools">
            <Chip tone="exp" material="outline" className="netchip">
              Robinhood Testnet · 46630
            </Chip>
            <Button variant="ghost" size="small" onClick={actions.pressWalletButton}>
              {model.wallet.walletButtonLabel}
            </Button>
          </div>
        </div>
      </header>
      <div className="appshell">
        <Rail />
        <main className="appmain" id="main" tabIndex={-1}>
          {model.mode === "demo" ? <DemoBar /> : null}
          {children}
        </main>
      </div>
      <TabBar />
    </>
  );
}
