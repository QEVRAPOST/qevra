import { isAddress } from "viem";
import { readRobinhoodPendingNonce, RobinhoodRpcError, type RobinhoodPendingNonceSnapshot } from "@/features/wallet/public-rpc";

const NO_STORE = { "cache-control": "no-store" };
type PendingNonceReader = (address: string) => Promise<RobinhoodPendingNonceSnapshot>;
const SAFE_RPC_MESSAGES: Record<string, string> = {
  network_not_available: "Robinhood Mainnet pending nonce reads are not enabled.",
  rpc_timeout: "The public Robinhood RPC timed out while checking the pending nonce.",
  rpc_unavailable: "The public Robinhood RPC could not be reached.",
  rpc_http_error: "The public Robinhood RPC returned an HTTP error.",
  rpc_error: "The public Robinhood RPC rejected the read-only nonce query.",
  rpc_invalid_response: "The public Robinhood RPC returned an invalid response.",
  rpc_chain_id_mismatch: "The public RPC did not confirm Robinhood Mainnet chain 4663.",
  rpc_invalid_nonce: "The public Robinhood RPC returned an invalid pending nonce.",
};

function publicError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

export function createPendingNonceHandler(readNonce: PendingNonceReader = readRobinhoodPendingNonce) {
  return async function GET(request: Request): Promise<Response> {
    const addresses = new URL(request.url).searchParams.getAll("address");
    if (addresses.length !== 1 || !isAddress(addresses[0]!)) {
      return publicError("invalid_address", "Provide exactly one valid EVM address to inspect.", 400);
    }

    try {
      const snapshot = await readNonce(addresses[0]!);
      return Response.json(snapshot, { headers: NO_STORE });
    } catch (error) {
      if (error instanceof RobinhoodRpcError) {
        const status = error.code === "invalid_address" ? 400
          : error.code === "network_not_available" ? 503
            : error.code === "rpc_timeout" || error.code === "rpc_unavailable" ? 503 : 502;
        return publicError(error.code, SAFE_RPC_MESSAGES[error.code] ?? "The public Robinhood RPC could not be reached.", status);
      }
      return publicError("rpc_unavailable", "The public Robinhood RPC could not be reached.", 503);
    }
  };
}
