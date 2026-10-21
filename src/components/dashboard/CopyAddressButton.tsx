"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { copyTextToClipboard } from "@/features/wallet/clipboard";

export type CopyAddressStatus = "idle" | "copied" | "unavailable";

export function copyAddressFeedback(status: CopyAddressStatus, label: string) {
  return {
    label: status === "copied" ? "Copied" : status === "unavailable" ? "Copy unavailable" : label,
    announcement: status === "copied" ? "Address copied to clipboard." : status === "unavailable" ? "Address could not be copied." : "",
  };
}

export function CopyAddressButton({ address, label = "Copy address" }: { address: string; label?: string }) {
  const statusId = useId();
  const [status, setStatus] = useState<CopyAddressStatus>("idle");
  const feedback = copyAddressFeedback(status, label);

  async function copyAddress() {
    const copied = await copyTextToClipboard(address);
    setStatus(copied ? "copied" : "unavailable");
    window.setTimeout(() => setStatus("idle"), 1_800);
  }

  return (
    <>
      <Button type="button" variant="ghost" size="small" onClick={() => { void copyAddress(); }} aria-describedby={statusId}>
        {feedback.label}
      </Button>
      <span className="sr" id={statusId} role="status" aria-live="polite">
        {feedback.announcement}
      </span>
    </>
  );
}
