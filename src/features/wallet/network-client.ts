import { NETWORKS } from "@/lib/config/networks";
import type { NetworkId } from "@/types/network";
import { isAddress } from "viem";
import type { RobinhoodNetworkSnapshot, RobinhoodPublicAddressSnapshot } from "./public-rpc";

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
  invalid_address: "Enter a valid EVM address to inspect.",
};

function publicHttpErrorMessage(responseStatus: number, upstreamMessage: unknown): string {
  const upstreamStatus = typeof upstreamMessage === "string"
    ? /^The public Robinhood RPC returned HTTP (403|429)\.$/.exec(upstreamMessage)?.[1]
    : undefined;
  const status = upstreamStatus ? Number(upstreamStatus) : responseStatus;
  if (status === 403) return "The public RPC denied this read (HTTP 403).";
  if (status === 429) return "The public RPC is rate-limiting reads (HTTP 429). Wait before retrying.";
  return PUBLIC_ERROR_MESSAGES.rpc_http_error!;
}

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

function isPublicAddressSnapshot(
  value: unknown,
  expectedNetwork: NetworkId,
  expectedAddress: string,
): value is RobinhoodPublicAddressSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<RobinhoodPublicAddressSnapshot>;
  const network = NETWORKS.find((option) => option.id === expectedNetwork);
  return snapshot.networkId === expectedNetwork
    && snapshot.chainId === network?.chainId
    && typeof snapshot.address === "string"
    && snapshot.address.toLowerCase() === expectedAddress.toLowerCase()
    && typeof snapshot.balanceWei === "string"
    && /^\d+$/.test(snapshot.balanceWei)
    && typeof snapshot.observedBlock === "string"
    && /^\d+$/.test(snapshot.observedBlock)
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
    let code = response.status === 403 || response.status === 429 ? "rpc_http_error" : "rpc_unavailable";
    let upstreamMessage: unknown;
    try {
      const body = await response.json() as { error?: { code?: unknown; message?: unknown } };
      if (typeof body.error?.code === "string" && PUBLIC_ERROR_MESSAGES[body.error.code]) code = body.error.code;
      upstreamMessage = body.error?.message;
    } catch {
      // The public UI reports a fixed message; response bodies are untrusted.
    }
    const message = code === "rpc_http_error"
      ? publicHttpErrorMessage(response.status, upstreamMessage)
      : PUBLIC_ERROR_MESSAGES[code]!;
    throw new NetworkStatusClientError(code, response.status, message);
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

/** Reads an address through the same-origin public API without connecting to a wallet. */
export async function getRobinhoodPublicAddress(
  networkId: NetworkId,
  address: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RobinhoodPublicAddressSnapshot> {
  if (!isAddress(address)) {
    throw new NetworkStatusClientError("invalid_address", 400, PUBLIC_ERROR_MESSAGES.invalid_address!);
  }

  let response: Response;
  try {
    response = await fetchImpl(`/api/network/${networkId}?address=${encodeURIComponent(address)}`, {
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
    let code = response.status === 403 || response.status === 429 ? "rpc_http_error" : "rpc_unavailable";
    let upstreamMessage: unknown;
    try {
      const body = await response.json() as { error?: { code?: unknown; message?: unknown } };
      if (typeof body.error?.code === "string" && PUBLIC_ERROR_MESSAGES[body.error.code]) code = body.error.code;
      upstreamMessage = body.error?.message;
    } catch {
      // Keep the public UI error fixed even if the server body is malformed.
    }
    const message = code === "rpc_http_error"
      ? publicHttpErrorMessage(response.status, upstreamMessage)
      : PUBLIC_ERROR_MESSAGES[code]!;
    throw new NetworkStatusClientError(code, response.status, message);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new NetworkStatusClientError("rpc_invalid_response", response.status, PUBLIC_ERROR_MESSAGES.rpc_invalid_response!);
  }
  if (!isPublicAddressSnapshot(body, networkId, address)) {
    throw new NetworkStatusClientError("rpc_invalid_response", response.status, PUBLIC_ERROR_MESSAGES.rpc_invalid_response!);
  }
  return body;
}
