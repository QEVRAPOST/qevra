"use client";

import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { useMediaQuery } from "@/lib/use-media-query";
import { useAppModel } from "./DemoAppProvider";

/**
 * The network menu in the top bar. It replaces the fixed "Robinhood Testnet · 46630" chip.
 * Mainnet is in the list so the menu is ready for it, but it is disabled and says why: it is not available yet.
 * Choosing a network only records the choice in the app model; this component reads no chain and signs nothing.
 */
export function NetworkSelect() {
  const { model, actions } = useAppModel();
  const narrow = useMediaQuery("(max-width: 560px)");
  const { selected, options } = model.network;

  return (
    <label className="netsel">
      <StatusMaterial material="outline" />
      <span className="sr">Network</span>
      <select value={selected} onChange={(e) => actions.setNetwork(e.target.value as typeof selected)}>
        {options.map((n) => {
          const note = n.available ? "" : ` (${n.note ?? "not available"})`;
          /* on a phone the top bar has room for the name only; the chain id is on the full-width menu */
          const text = narrow ? `${n.short}${note}` : `${n.label} · ${n.chainId}${note}`;
          return (
            <option key={n.id} value={n.id} disabled={!n.available}>
              {text}
            </option>
          );
        })}
      </select>
      <svg className="netcaret" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
        <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}
