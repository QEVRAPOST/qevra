"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import type { InjectedReadOnlyWalletChoice } from "@/features/wallet/browser";

interface WalletPickerDialogProps {
  open: boolean;
  choices: InjectedReadOnlyWalletChoice[];
  isDiscovering: boolean;
  error?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function WalletPickerDialog({ open, choices, isDiscovering, error, onSelect, onClose }: WalletPickerDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="wallet-picker-overlay">
      <div
        ref={dialogRef}
        className="wallet-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-picker-title"
        tabIndex={-1}
      >
        <div className="wallet-picker-heading">
          <div>
            <p className="wallet-picker-eyebrow">Read-only connection</p>
            <h2 id="wallet-picker-title">Choose a wallet</h2>
          </div>
          <Button variant="quiet" size="icon" aria-label="Close wallet picker" onClick={onClose}>×</Button>
        </div>
        <p className="wallet-picker-intro">Connect a browser wallet to read its public account, network, and native balance.</p>
        {isDiscovering ? <p className="wallet-picker-status" role="status">Searching for installed EVM wallets…</p> : null}
        {error ? <p className="wallet-picker-error" role="alert">{error}</p> : null}
        {choices.length > 0 ? (
          <div className="wallet-picker-choices" aria-label="Installed browser wallets">
            {choices.map((choice) => {
              const icon = choice.icon ?? (choice.rdns === "app.phantom" ? "/wallets/phantom.svg" : undefined);
              return (
                <Button key={choice.id} variant="ghost" className="wallet-picker-choice" aria-label={`Continue with ${choice.name}`} onClick={() => onSelect(choice.id)}>
                  <span className="wallet-picker-provider">
                    <span className="wallet-picker-icon-slot" aria-hidden="true">
                      {icon
                        ? <Image className="wallet-picker-icon" src={icon} alt="" aria-hidden="true" width={28} height={28} unoptimized />
                        : <span className="wallet-picker-icon-fallback">{choice.name.slice(0, 1).toUpperCase()}</span>}
                    </span>
                    <span className="wallet-picker-label">
                      <span className="wallet-picker-name">{choice.name}</span>
                      {choice.rdns ? <span className="wallet-picker-rdns">{choice.rdns}</span> : null}
                    </span>
                  </span>
                  <span className="wallet-picker-arrow" aria-hidden="true">→</span>
                </Button>
              );
            })}
          </div>
        ) : !isDiscovering && !error ? (
          <p className="wallet-picker-empty">No compatible browser wallets were discovered. Install MetaMask, Phantom, or another EVM wallet and try again.</p>
        ) : null}
        <p className="wallet-picker-security">Account access is requested only after you choose a wallet. No signing, transactions, or network switching.</p>
      </div>
    </div>
  );
}
