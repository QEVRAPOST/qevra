/*
 * What works today, in one place. The Overview and the Status route both read this, so they can never disagree.
 * It is derived only from the app model (demo fixtures or live data): nothing here is fetched, guessed or made up,
 * and a value the model does not have is shown as unavailable, never as a plausible number.
 */
import type { AppModel, Material, Tone } from "@/types";

export type ReadinessId = "network" | "wallet" | "swarm" | "swap" | "pq" | "audit";

export interface ReadinessRow {
  id: ReadinessId;
  /** `now`: something the visitor can do today. `off`: switched off, experimental or not done. */
  group: "now" | "off";
  label: string;
  /** the state in a few words */
  value: string;
  /** one plain sentence of what that means for the visitor */
  detail: string;
  tone: Tone;
  material: Material;
  href: string;
  linkLabel: string;
}

function short(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export function buildReadiness(model: AppModel): ReadinessRow[] {
  const live = model.mode === "live";
  const net = model.network.options.find((n) => n.id === model.network.selected);
  const rpc = model.network.rpc;
  const conn = model.wallet.connection;
  const sec = model.security;
  const caps = sec.capabilities;

  const network: ReadinessRow = live
    ? rpc.status === "available"
      ? { id: "network", group: "now", label: "Network", value: `${net?.label ?? "Network"} · reading`, detail: `Public data is read from block ${rpc.latestBlock ?? "unknown"}. Nothing is written.`, tone: "neutral", material: "outline", href: "/app/protocol", linkLabel: "See status" }
      : rpc.status === "loading"
        ? { id: "network", group: "now", label: "Network", value: "Checking", detail: "Asking the public RPC for the latest block.", tone: "unk", material: "dotted", href: "/app/protocol", linkLabel: "See status" }
        : { id: "network", group: "now", label: "Network", value: "RPC unavailable", detail: rpc.message ?? "The public RPC did not answer. No value is shown in its place.", tone: "bad", material: "outline", href: "/app/protocol", linkLabel: "See status" }
    : { id: "network", group: "now", label: "Network", value: `${net?.short ?? "Testnet"} · example`, detail: "Example mode reads no chain. The network name is only a label here.", tone: "demo", material: "dotted", href: "/app/protocol", linkLabel: "See status" };

  const wallet: ReadinessRow = live
    ? conn?.address
      ? { id: "wallet", group: "now", label: "Wallet", value: `${short(conn.address)} · read-only`, detail: model.network.walletMismatch ? "Your wallet is on a different network from the one the app reads. It was not changed." : "Connected for public reads. The app cannot sign or move anything.", tone: model.network.walletMismatch ? "exp" : "neutral", material: "outline", href: "/app/wallet", linkLabel: "Open wallet" }
      : { id: "wallet", group: "now", label: "Wallet", value: "Not connected", detail: "Connecting is optional and only when you choose. It shows a public balance.", tone: "unk", material: "dotted", href: "/app/wallet", linkLabel: "Connect read-only" }
    : { id: "wallet", group: "now", label: "Wallet", value: model.wallet.stage === 0 ? "Not connected · example" : "Example wallet", detail: "A pretend wallet that shows how the screen will look. It is not a real account.", tone: "demo", material: "dotted", href: "/app/wallet", linkLabel: "Open wallet" };

  const swarm: ReadinessRow = live
    ? sec.accessState === "unauthenticated"
      ? { id: "swarm", group: "now", label: "Security Swarm", value: "Sign-in required", detail: "Saved research and new runs require an operator session. Public wallet and network reads are available without it.", tone: "unk", material: "dotted", href: "/app/security", linkLabel: "Sign in to Swarm" }
      : sec.accessState === "not_configured"
        ? { id: "swarm", group: "now", label: "Security Swarm", value: "Access not configured", detail: "The server has not configured operator authentication. Public wallet and network reads remain available.", tone: "unk", material: "dotted", href: "/app/security", linkLabel: "Open Swarm" }
        : sec.accessState === "checking"
          ? { id: "swarm", group: "now", label: "Security Swarm", value: "Checking access", detail: "Checking the operator session. Public wallet and network reads remain available.", tone: "unk", material: "dotted", href: "/app/security", linkLabel: "Open Swarm" }
          : sec.accessState === "service_error" || sec.accessState === "rate_limited"
            ? { id: "swarm", group: "now", label: "Security Swarm", value: sec.accessState === "rate_limited" ? "Access rate-limited" : "Access unavailable", detail: sec.unavailableMessage ?? "Operator access could not be checked. Public wallet and network reads remain available.", tone: "unk", material: "dotted", href: "/app/security", linkLabel: "Retry access" }
          : !caps && sec.unavailableMessage
            ? { id: "swarm", group: "now", label: "Security Swarm", value: "Research service unavailable", detail: sec.unavailableMessage, tone: "unk", material: "dotted", href: "/app/security", linkLabel: "Retry history" }
          : !caps
      ? { id: "swarm", group: "now", label: "Security Swarm", value: "Checking", detail: "Asking the research service what it can do right now.", tone: "unk", material: "dotted", href: "/app/security", linkLabel: "Open Swarm" }
      : caps.provider === "available" && caps.worker === "available" && caps.persistence === "available"
        ? { id: "swarm", group: "now", label: "Security Swarm", value: "Ready to research", detail: "You can start a run on an approved topic. A finished run is research, not an audit.", tone: "neutral", material: "outline", href: "/app/security", linkLabel: "Start a run" }
        : { id: "swarm", group: "now", label: "Security Swarm", value: caps.provider !== "available" ? "Provider unavailable" : "Service unavailable", detail: "New runs cannot start. Saved runs can still be opened.", tone: "unk", material: "dotted", href: "/app/security", linkLabel: "Open history" }
    : { id: "swarm", group: "now", label: "Security Swarm", value: "Example runs only", detail: "Example runs show how a run looks. No agent runs in example mode.", tone: "demo", material: "dotted", href: "/app/security", linkLabel: "See how it works" };

  const swap: ReadinessRow = { id: "swap", group: "off", label: "Swap", value: "Switched off", detail: "No route is configured, so there is no quote and no transaction. The page previews the steps.", tone: "unk", material: "dotted", href: "/app/swap", linkLabel: "See the preview" };
  const pq: ReadinessRow = { id: "pq", group: "off", label: "PQ authorization", value: "Experimental", detail: "ML-DSA is under evaluation. No key can be registered and no account exists.", tone: "exp", material: "outline", href: "/app/wallet", linkLabel: "See the account concept" };
  const audit: ReadinessRow = { id: "audit", group: "off", label: "Independent audit", value: "None yet", detail: "No independent audit has been done. Research runs are not a substitute for one.", tone: "unk", material: "dotted", href: "/app/protocol", linkLabel: "See limits" };

  return [network, wallet, swarm, swap, pq, audit];
}
