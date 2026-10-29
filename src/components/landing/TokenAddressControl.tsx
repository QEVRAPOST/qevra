"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { getVeyraTokenConfig } from "@/lib/config/veyra-token";

function shorten(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function TokenAddressControl() {
  const token = getVeyraTokenConfig();
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const feedbackTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
  }, []);
  if (!token) return null;

  const copyAddress = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard is unavailable");
      await navigator.clipboard.writeText(token.address);
      setStatus("copied");
      window.clearTimeout(feedbackTimer.current ?? undefined);
      feedbackTimer.current = window.setTimeout(() => setStatus("idle"), 1500);
    } catch {
      window.clearTimeout(feedbackTimer.current ?? undefined);
      setStatus("error");
    }
  };

  return (
    <div className="token-address-control">
      <span className="token-address-label">Configured token address · {token.network.label}</span>
      <code title={token.address}>{shorten(token.address)}</code>
      <button
        type="button"
        onClick={copyAddress}
        aria-label="Copy configured VEYRA token address"
        title="Copy configured VEYRA token address"
      >
        {status === "copied" ? <Check size={15} aria-hidden="true" /> : status === "error" ? <TriangleAlert size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      </button>
      <span className="token-address-feedback" role="status" aria-live="polite">
        {status === "copied" ? "Copied" : status === "error" ? "Clipboard unavailable" : ""}
      </span>
    </div>
  );
}
