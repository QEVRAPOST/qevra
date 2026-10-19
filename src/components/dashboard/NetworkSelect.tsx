"use client";

import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMediaQuery } from "@/lib/use-media-query";
import type { NetworkId } from "@/types";
import { useAppModel } from "./DemoAppProvider";

/**
 * The network menu in the top bar (a shadcn Select). It replaces the fixed "Robinhood Testnet · 46630" chip.
 * Mainnet is in the list so the menu is ready for it, but it is disabled and says why: it is not available yet.
 * Choosing a network only records the choice in the app model; this component reads no chain and signs nothing.
 */
export function NetworkSelect() {
  const { model, actions } = useAppModel();
  const narrow = useMediaQuery("(max-width: 560px)");
  const { selected, options } = model.network;

  return (
    <Select value={selected} onValueChange={(v) => actions.setNetwork(v as NetworkId)}>
      <SelectTrigger
        aria-label={model.mode === "live" ? "Application network" : "Example network"}
        className="h-8 w-64 border-exp font-mono text-xs text-exp hover:border-exp hover:bg-exp/10 data-[state=open]:border-exp max-sm:w-[5.6rem] max-sm:gap-1.5 max-sm:px-2"
      >
        {/* the circle goes first on a narrow bar, so the name fits */}
        <span className="inline-flex max-[420px]:hidden">
          <StatusMaterial material="outline" />
        </span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="min-w-64 font-mono max-sm:min-w-56">
        {options.map((n) => (
          /* on a phone the top bar has room for the name only; the chain id is in the full-width menu */
          <SelectItem key={n.id} value={n.id} disabled={!n.available} hint={n.available ? undefined : (n.note ?? "not available")} className="text-xs">
            {narrow ? n.short : `${n.label} · ${n.chainId}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
