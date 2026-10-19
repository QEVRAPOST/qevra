import { NETWORKS } from "@/lib/config/networks";
import type { NetworkId } from "@/types/network";
import type { RobinhoodNetworkSnapshot } from "./public-rpc";

export class NetworkStatusClientError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
    this.name = "NetworkStatusClientError";
  }
}

const PUBLIC_ERROR_MESSAGES: Record<string, string> = {
  network_not_available: "This network is not enabled for public reads.",
  rpc_timeout: "The public RPC request timed out.",
  rpc_unavailable: "The public RPC could not be reached.",
  rpc_http_error: "The public RPC returned an HTTP error.",
  rpc_error: "The public RPC rejected a read-only query.",
  rpc_invalid_response: "The public RPC returned an invalid response.",
  rpc_chain_id_mismatch: "The public RPC chain ID did not match the selected network.",
};

function isSnapshot(value: unknown, expectedNetwork: NetworkId): value is RobinhoodNetworkSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<RobinhoodNetworkSnapshot>;
  const network = NETWORKS.find((option) => option.id === expectedNetwork);
  return snapshot.networkId === expectedNetwork
    && snapshot.chainId === network?.chainId
    && typeof snapshot.latestBlock === "string"
    && /^\d+$/.test(snapshot.latestBlock)
    && typeof snapshot.observedAt === "string"
    && Number.isFinite(Date.parse(snapshot.observedAt));
}

export async function getRobinhoodNetworkStatus(
  networkId: NetworkId,
  fetchImpl: typeof fetch = fetch,
): Promise<RobinhoodNetworkSnapshot> {
  let response: Response;
  try {
    response = await fetchImpl(`/api/network/${networkId}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(9_000),
    });
  } catch (error) {
    const code = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
      ? "rpc_timeout"
      : "rpc_unavailable";
    throw new NetworkStatusClientError(code, 0, PUBLIC_ERROR_MESSAGES[code]!);
  }

  if (!response.ok) {
    let code = "rpc_unavailable";
    try {
      const body = await response.json() as { error?: { code?: unknown } };
      if (typeof body.error?.code === "string" && PUBLIC_ERROR_MESSAGES[body.error.code]) code = body.error.code;
    } catch {
      // The public UI reports a fixed message; response bodies are untrusted.
    }
    throw new NetworkStatusClientError(code, response.status, PUBLIC_ERROR_MESSAGES[code]!);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new NetworkStatusClientError("rpc_invalid_response", response.status, PUBLIC_ERROR_MESSAGES.rpc_invalid_response!);
  }
  if (!isSnapshot(body, networkId)) {
    throw new NetworkStatusClientError("rpc_invalid_response", response.status, PUBLIC_ERROR_MESSAGES.rpc_invalid_response!);
  }
  return body;
}
