"use client";

import { useState } from "react";
import { copyTextToClipboard } from "@/features/wallet/clipboard";

export function CopyAddressButton({ address }: { address: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "unavailable">("idle");

  async function copyAddress() {
    const copied = await copyTextToClipboard(address);
    setStatus(copied ? "copied" : "unavailable");
    window.setTimeout(() => setStatus("idle"), 1_800);
  }

  return (
    <button type="button" className="wl-copy" onClick={() => { void copyAddress(); }} aria-live="polite">
      {status === "copied" ? "Copied" : status === "unavailable" ? "Copy unavailable" : "Copy address"}
    </button>
  );
}
